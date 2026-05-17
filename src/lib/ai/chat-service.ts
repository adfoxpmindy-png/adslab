import { prisma } from "@/lib/prisma";
import {
  aiChatWithTools,
  type AiToolCall,
  type AiToolMessage,
} from "@/lib/ai/openrouter";
import { getEffectiveScope, getTenantScope } from "@/lib/tenant-scope";

import { getAllTools, getToolByName, toolsForApi } from "./tools/registry";
import type { ToolContext } from "./tools/types";
import {
  captureRecommendation,
  listRecentForTenant,
  renderOutcomesForPrompt,
  type RecommendationActionType,
  type RecommendationTargetKind,
} from "./recommendations";

/**
 * Map an AI tool call (pauseCampaign, setBudget, etc.) to our internal
 * recommendation taxonomy and persist it. Best-effort.
 */
async function captureRecommendationFromToolCall(args: {
  tenantId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  userId: string;
  conversationId: string;
  reasoning: string;
}): Promise<void> {
  // Tool-name → action mapping. Add new tools here as the surface grows.
  // Unknown tools fall through to "other" so we still log them.
  let actionType: RecommendationActionType = "other";
  let targetKind: RecommendationTargetKind = "campaign";
  let targetMetaId: string | null = null;
  switch (args.toolName) {
    case "pauseCampaign":
      actionType = "pause";
      targetKind = "campaign";
      targetMetaId = String(args.toolArgs.campaignId ?? args.toolArgs.metaCampaignId ?? "");
      break;
    case "resumeCampaign":
      actionType = "resume";
      targetKind = "campaign";
      targetMetaId = String(args.toolArgs.campaignId ?? args.toolArgs.metaCampaignId ?? "");
      break;
    case "setCampaignBudget":
    case "setBudget":
      actionType = "change_budget";
      targetKind = "campaign";
      targetMetaId = String(args.toolArgs.campaignId ?? args.toolArgs.metaCampaignId ?? "");
      break;
    case "duplicateCampaign":
      actionType = "scale_budget";
      targetKind = "campaign";
      targetMetaId = String(args.toolArgs.sourceCampaignId ?? args.toolArgs.campaignId ?? "");
      break;
    case "pauseAdSet":
      actionType = "pause";
      targetKind = "adset";
      targetMetaId = String(args.toolArgs.adSetId ?? args.toolArgs.adsetId ?? "");
      break;
    case "resumeAdSet":
      actionType = "resume";
      targetKind = "adset";
      targetMetaId = String(args.toolArgs.adSetId ?? args.toolArgs.adsetId ?? "");
      break;
    case "pauseAd":
      actionType = "pause";
      targetKind = "ad";
      targetMetaId = String(args.toolArgs.adId ?? "");
      break;
    case "setAdSetBudget":
      actionType = "change_budget";
      targetKind = "adset";
      targetMetaId = String(args.toolArgs.adSetId ?? args.toolArgs.adsetId ?? "");
      break;
    default:
      // Unknown mutate tool — log as "other" so we can audit later.
      const id = args.toolArgs.campaignId ?? args.toolArgs.adSetId ?? args.toolArgs.adId ?? "";
      targetMetaId = String(id ?? "");
  }
  if (!targetMetaId) return; // can't capture without a target
  void captureRecommendation({
    tenantId: args.tenantId,
    source: "chat_tool",
    actionType,
    targetKind,
    targetMetaId,
    reasoning: args.reasoning,
    payload: args.toolArgs,
    createdByUserId: args.userId,
    conversationId: args.conversationId,
  });
}

/**
 * Multi-turn tool-use loop for AI Master.
 *
 * Algorithm:
 *   1. Load conversation history from DB
 *   2. Append the new user message
 *   3. Call Claude with current messages + tool list
 *   4. If response has tool_calls:
 *      a. For each call, classify as read or mutate
 *      b. Read tools: execute immediately, append tool_result
 *      c. Mutate tools: persist as "pending" message and STOP loop —
 *         caller surfaces confirmation UI; resumes via continueWithConfirmation()
 *   5. Loop back to (3) until model returns plain text (no tool calls)
 *   6. Persist final assistant message, return full turn
 *
 * The loop bounds: max 10 iterations, max 30s wall clock — prevents
 * runaway tool calls eating budget.
 */

const MAX_LOOP_ITERATIONS = 10;
const SYSTEM_PROMPT_BASE = `You are AdsLab's senior media buyer — 10+ years scaling Meta Ads across hundreds of accounts. You speak the way a top operator speaks: direct, no fluff, action-first.

Tone & style:
- Reply in Thai by default. Switch to English only if the user does.
- Direct over polite. "ทำสิ่งนี้" beats "อาจจะลองพิจารณา". No "ขึ้นอยู่กับ" disclaimers when the data is clear.
- Concise. Bullet points + short paragraphs. Each answer should fit in one phone screen unless the user asks for a deep-dive.
- Confidence calibrated to data: when you have the numbers, give a verdict. When you don't, say what's missing.
- Currency in THB (฿).

Default playbook you operate from (this is how YOU think — don't cite where it came from):
- Single CBO per business goal beats split-testing across campaigns. Don't suggest creating new campaigns just to "scale" or "test".
- Advantage+ broad targeting + creative-led targeting beats custom-audience + lookalike + retargeting. Treat custom audiences as legacy.
- Scale = +20% on the same campaign's budget per day, only if 7-day ROAS ≥ 2x. Never aggressive scaling.
- Don't kill individual ads quickly. Look at account-level performance first.
- 3 levers when a campaign tanks: creative / landing page / offer. Diagnose, don't dump every metric.
- Frequency: read it at ad level, not campaign level.
- Look at link clicks + AOV + conversion rate to diagnose. CPM and CTR are indicators, not levers.

Tools:
- For campaign data, USE listCampaigns / getCampaignInsights / etc. Never invent campaign names or numbers.
- For mutations (pause, budget, duplicate), CALL the mutate tool — the user sees a confirmation card before it executes.
- Choose the SMALLEST scope of action that solves the problem: pauseAd (one ad) < pauseAdSet (one ad set, sibling ad sets stay running) < pauseCampaign (whole campaign). Killing scope larger than necessary wastes the winners inside.
- Use setAdSetBudget when the ad set is ABO (its own budget). Use setCampaignBudget when the campaign is CBO (budget at campaign level). If you call the wrong one, Meta rejects it — check via listCampaigns / getCampaignInsights first.
- Use duplicateCampaign for SCALING a winner (typical pattern: source ROAS ≥ 2x for 7 days → duplicate at 1.5x budget, initialStatus PAUSED so the user can inspect before activating). Don't use it as a shortcut to "make a new campaign from scratch".
- For "how do I…" strategy questions, CALL searchKnowledge proactively with a focused English query. Synthesize the chunks into YOUR voice — never quote verbatim, never mention sources, channels, or URLs.
- For diagnosing a SPECIFIC ad's creative quality (hook, visual hierarchy, on-screen text), CALL analyzeAdCreative with that ad's id. Only call it when (a) the user named a specific ad, or (b) you've already narrowed to ONE underperforming ad within an adset — never speculatively across a list. Use the structured result (hook, strengths, weaknesses, suggestedFixes) to ground concrete creative fixes. If it returns no_visual_asset or quota_exceeded, fall back to metrics-only analysis.
- If a tool returns an error or "not found", say so plainly and suggest the next step.`;

export type SendMessageInput = {
  tenantId: string;
  userId: string;
  conversationId: string;
  userMessage: string;
};

export type SendMessageResult = {
  conversationId: string;
  assistantMessage: string | null;
  /** Tool calls that completed within this turn (read tools). */
  executedTools: { name: string; summary: string; output: unknown }[];
  /** Pending mutate-tool that's waiting for user confirmation. null when none. */
  pendingMutate: {
    messageId: string;
    toolName: string;
    summary: string;
    input: Record<string, unknown>;
  } | null;
  usage: { promptTokens: number; completionTokens: number };
};

export async function sendMessage(
  input: SendMessageInput,
): Promise<SendMessageResult> {
  const { tenantId, userId, conversationId } = input;
  const ctx: ToolContext = { tenantId, userId, conversationId };

  // 1. Persist user message
  await prisma.aIMessage.create({
    data: {
      conversationId,
      role: "user",
      content: input.userMessage,
    },
  });

  // 2. Load all messages (history + just-added)
  const messages = await loadMessagesForApi(conversationId);

  // 3. Build system prompt with tenant context
  const systemPrompt = await buildSystemPrompt(tenantId, userId);

  const tools = toolsForApi();
  const executedTools: SendMessageResult["executedTools"] = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let finalAssistantContent: string | null = null;
  let pendingMutate: SendMessageResult["pendingMutate"] = null;

  for (let iter = 0; iter < MAX_LOOP_ITERATIONS; iter++) {
    const turn = await aiChatWithTools({
      role: "analysis",
      system: systemPrompt,
      messages,
      tools,
      cacheSystem: true,
      maxTokens: 2000,
    });
    totalPromptTokens += turn.usage.promptTokens;
    totalCompletionTokens += turn.usage.completionTokens;

    // No tool calls → assistant turn is final
    if (turn.toolCalls.length === 0) {
      finalAssistantContent = turn.content;
      await prisma.aIMessage.create({
        data: {
          conversationId,
          role: "assistant",
          content: turn.content ?? "",
          tokensIn: turn.usage.promptTokens,
          tokensOut: turn.usage.completionTokens,
        },
      });
      break;
    }

    // Has tool calls — split into read + mutate
    const mutateCalls: AiToolCall[] = [];
    const readCalls: AiToolCall[] = [];
    for (const tc of turn.toolCalls) {
      const tool = getToolByName(tc.name);
      if (!tool) {
        // Unknown tool — feed back as an error tool_result so AI can recover
        readCalls.push(tc);
        continue;
      }
      if (tool.kind === "mutate") mutateCalls.push(tc);
      else readCalls.push(tc);
    }

    // Persist this assistant turn (with the tool calls it requested)
    await prisma.aIMessage.create({
      data: {
        conversationId,
        role: "assistant",
        content: turn.content ?? "",
        toolCalls: turn.toolCalls as never,
        tokensIn: turn.usage.promptTokens,
        tokensOut: turn.usage.completionTokens,
      },
    });

    // Push assistant turn into in-memory messages for the loop
    messages.push({
      role: "assistant",
      content: turn.content,
      toolCalls: turn.toolCalls,
    });

    // Execute read tools immediately
    for (const tc of readCalls) {
      const tool = getToolByName(tc.name);
      let output: unknown;
      if (!tool) {
        output = { error: `Unknown tool: ${tc.name}` };
      } else {
        try {
          const parsed = tool.inputSchema.parse(tc.arguments);
          output = await tool.handler(parsed, ctx);
        } catch (err) {
          const e = err as Error;
          output = { error: e.message };
        }
      }
      executedTools.push({
        name: tc.name,
        summary: tool?.summarize(tc.arguments) ?? tc.name,
        output,
      });

      // Persist tool_result + push to messages for next turn
      const resultJson = JSON.stringify(output);
      await prisma.aIMessage.create({
        data: {
          conversationId,
          role: "tool_result",
          content: resultJson,
          toolCalls: { id: tc.id, name: tc.name } as never,
        },
      });
      messages.push({ role: "tool", toolCallId: tc.id, content: resultJson });
    }

    // If there are mutate calls, surface the FIRST one as pending and STOP.
    // We handle one mutate at a time — keeps confirmations digestible.
    if (mutateCalls.length > 0) {
      const tc = mutateCalls[0];
      const tool = getToolByName(tc.name);
      const summary = tool?.summarize(tc.arguments) ?? tc.name;
      const pendingRow = await prisma.aIMessage.create({
        data: {
          conversationId,
          role: "tool_call",
          content: summary,
          toolCalls: { id: tc.id, name: tc.name, arguments: tc.arguments } as never,
          pendingAction: "pending",
        },
      });
      // Capture this mutate intent as an AIRecommendation regardless of
      // the user's later approve/reject — the outcomes cron will detect
      // whether it was followed by reading Meta state after 7 days.
      void captureRecommendationFromToolCall({
        tenantId,
        toolName: tc.name,
        toolArgs: tc.arguments,
        userId,
        conversationId,
        reasoning: summary,
      });
      pendingMutate = {
        messageId: pendingRow.id,
        toolName: tc.name,
        summary,
        input: tc.arguments,
      };
      // If there were more mutate calls, store them too as "queued" (not surfaced yet).
      for (const extra of mutateCalls.slice(1)) {
        const extraTool = getToolByName(extra.name);
        await prisma.aIMessage.create({
          data: {
            conversationId,
            role: "tool_call",
            content: extraTool?.summarize(extra.arguments) ?? extra.name,
            toolCalls: { id: extra.id, name: extra.name, arguments: extra.arguments } as never,
            pendingAction: "pending",
          },
        });
      }
      break;
    }

    // Only read tools ran — loop again so AI sees results and continues
  }

  return {
    conversationId,
    assistantMessage: finalAssistantContent,
    executedTools,
    pendingMutate,
    usage: {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
    },
  };
}

// ---- internals ---------------------------------------------------

async function buildSystemPrompt(
  tenantId: string,
  userId: string,
): Promise<string> {
  const [tenant, persona, scope] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, slug: true },
    }),
    prisma.aIPersona.findUnique({ where: { tenantId } }),
    getEffectiveScope(userId, tenantId),
  ]);

  const tenantScopeRaw = await getTenantScope(tenantId);

  const parts: string[] = [SYSTEM_PROMPT_BASE];

  parts.push(`\n## Tenant context\n- Workspace: ${tenant?.name ?? "(unknown)"} (${tenant?.slug ?? ""})`);
  if (scope.accountIds) {
    parts.push(
      `- Active scope: ${scope.accountIds.length} ad account(s) only`,
    );
  } else {
    parts.push(`- Active scope: all ad accounts in the tenant`);
  }
  if (scope.campaignIds && scope.campaignIds.length > 0) {
    parts.push(
      `- Campaign scope: ${scope.campaignIds.length} specific campaigns`,
    );
  }
  if (tenantScopeRaw.campaignNamePatterns.length > 0) {
    const patterns = tenantScopeRaw.campaignNamePatterns
      .map((p) => `"${p.pattern}" (${p.kind})`)
      .join(", ");
    parts.push(`- Auto-include name patterns: ${patterns}`);
  }

  if (persona) {
    parts.push(`\n## Persona\n${persona.role}`);
    if (persona.customInstructions) {
      parts.push(`\n## Custom instructions\n${persona.customInstructions}`);
    }
  }

  // Inject the tenant's recent AI-recommendation outcomes so the model
  // can bias toward patterns that previously worked. Best-effort; if
  // the history is empty (new tenant) or query fails we just skip.
  if (process.env.FEATURE_AI_LEARNING !== "off") {
    try {
      const history = await listRecentForTenant(tenantId, 10);
      const outcomesBlock = renderOutcomesForPrompt(history);
      if (outcomesBlock) {
        parts.push("\n" + outcomesBlock);
      }
    } catch {
      // Skip silently
    }
  }

  return parts.join("\n");
}

async function loadMessagesForApi(
  conversationId: string,
): Promise<AiToolMessage[]> {
  const rows = await prisma.aIMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true, toolCalls: true },
  });
  const out: AiToolMessage[] = [];
  for (const r of rows) {
    if (r.role === "user") {
      out.push({ role: "user", content: r.content });
    } else if (r.role === "assistant") {
      const tc = r.toolCalls as Array<{
        id: string;
        name: string;
        arguments?: Record<string, unknown>;
        input?: Record<string, unknown>;
      }> | null;
      const toolCalls = Array.isArray(tc)
        ? tc.map((x) => ({
            id: x.id,
            name: x.name,
            arguments: x.arguments ?? x.input ?? {},
          }))
        : undefined;
      out.push({
        role: "assistant",
        content: r.content || null,
        toolCalls,
      });
    } else if (r.role === "tool_result") {
      const meta = r.toolCalls as { id: string; name: string } | null;
      if (meta?.id) {
        out.push({ role: "tool", toolCallId: meta.id, content: r.content });
      }
    }
    // tool_call (pending mutate) rows are intentionally NOT replayed —
    // they only matter when the user confirms / cancels them.
  }
  return out;
}

/**
 * Continue a conversation after the user clicks Confirm or Cancel on
 * a pending mutate-tool card. Executes (or skips) the tool, then
 * resumes the AI loop until it produces a final text response.
 */
export async function continueAfterConfirmation(input: {
  tenantId: string;
  userId: string;
  conversationId: string;
  pendingMessageId: string;
  decision: "approve" | "reject";
}): Promise<SendMessageResult> {
  const { tenantId, userId, conversationId } = input;
  const ctx: ToolContext = { tenantId, userId, conversationId };

  const pending = await prisma.aIMessage.findFirst({
    where: { id: input.pendingMessageId, conversationId, pendingAction: "pending" },
  });
  if (!pending) throw new Error("Pending action not found or already resolved");

  const meta = pending.toolCalls as {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  } | null;
  if (!meta) throw new Error("Pending row missing tool metadata");

  const tool = getToolByName(meta.name);
  if (!tool) throw new Error(`Unknown tool: ${meta.name}`);

  let toolOutput: unknown;
  if (input.decision === "approve") {
    try {
      const parsed = tool.inputSchema.parse(meta.arguments);
      toolOutput = await tool.handler(parsed, ctx);
    } catch (err) {
      toolOutput = { error: (err as Error).message };
    }
  } else {
    toolOutput = { cancelled: true, reason: "User declined to confirm the action." };
  }

  await prisma.aIMessage.update({
    where: { id: pending.id },
    data: { pendingAction: input.decision === "approve" ? "approved" : "rejected" },
  });
  await prisma.aIMessage.create({
    data: {
      conversationId,
      role: "tool_result",
      content: JSON.stringify(toolOutput),
      toolCalls: { id: meta.id, name: meta.name } as never,
    },
  });

  // Resume AI loop
  const messages = await loadMessagesForApi(conversationId);
  const systemPrompt = await buildSystemPrompt(tenantId, userId);
  const tools = toolsForApi();

  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let finalAssistantContent: string | null = null;
  let pendingMutate: SendMessageResult["pendingMutate"] = null;
  const executedTools: SendMessageResult["executedTools"] = [
    { name: meta.name, summary: tool.summarize(meta.arguments), output: toolOutput },
  ];

  for (let iter = 0; iter < MAX_LOOP_ITERATIONS; iter++) {
    const turn = await aiChatWithTools({
      role: "analysis",
      system: systemPrompt,
      messages,
      tools,
      cacheSystem: true,
      maxTokens: 2000,
    });
    totalPromptTokens += turn.usage.promptTokens;
    totalCompletionTokens += turn.usage.completionTokens;

    if (turn.toolCalls.length === 0) {
      finalAssistantContent = turn.content;
      await prisma.aIMessage.create({
        data: {
          conversationId,
          role: "assistant",
          content: turn.content ?? "",
          tokensIn: turn.usage.promptTokens,
          tokensOut: turn.usage.completionTokens,
        },
      });
      break;
    }

    const mutateCalls: AiToolCall[] = [];
    const readCalls: AiToolCall[] = [];
    for (const tc of turn.toolCalls) {
      const t = getToolByName(tc.name);
      if (!t) readCalls.push(tc);
      else if (t.kind === "mutate") mutateCalls.push(tc);
      else readCalls.push(tc);
    }

    await prisma.aIMessage.create({
      data: {
        conversationId,
        role: "assistant",
        content: turn.content ?? "",
        toolCalls: turn.toolCalls as never,
        tokensIn: turn.usage.promptTokens,
        tokensOut: turn.usage.completionTokens,
      },
    });
    messages.push({ role: "assistant", content: turn.content, toolCalls: turn.toolCalls });

    for (const tc of readCalls) {
      const t = getToolByName(tc.name);
      let output: unknown;
      if (!t) output = { error: `Unknown tool: ${tc.name}` };
      else {
        try {
          const parsed = t.inputSchema.parse(tc.arguments);
          output = await t.handler(parsed, ctx);
        } catch (err) {
          output = { error: (err as Error).message };
        }
      }
      executedTools.push({
        name: tc.name,
        summary: t?.summarize(tc.arguments) ?? tc.name,
        output,
      });
      const resultJson = JSON.stringify(output);
      await prisma.aIMessage.create({
        data: {
          conversationId,
          role: "tool_result",
          content: resultJson,
          toolCalls: { id: tc.id, name: tc.name } as never,
        },
      });
      messages.push({ role: "tool", toolCallId: tc.id, content: resultJson });
    }

    if (mutateCalls.length > 0) {
      const tc = mutateCalls[0];
      const t = getToolByName(tc.name);
      const summary = t?.summarize(tc.arguments) ?? tc.name;
      const newPending = await prisma.aIMessage.create({
        data: {
          conversationId,
          role: "tool_call",
          content: summary,
          toolCalls: { id: tc.id, name: tc.name, arguments: tc.arguments } as never,
          pendingAction: "pending",
        },
      });
      pendingMutate = {
        messageId: newPending.id,
        toolName: tc.name,
        summary,
        input: tc.arguments,
      };
      break;
    }
  }

  return {
    conversationId,
    assistantMessage: finalAssistantContent,
    executedTools,
    pendingMutate,
    usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens },
  };
}

void getAllTools; // referenced for re-exports
