import { prisma } from "@/lib/prisma";
import {
  aiChatWithTools,
  type AiToolCall,
  type AiToolMessage,
} from "@/lib/ai/openrouter";
import { getEffectiveScope, getTenantScope } from "@/lib/tenant-scope";

import { getAllTools, getToolByName, toolsForApi } from "./tools/registry";
import type { ToolContext } from "./tools/types";

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
const SYSTEM_PROMPT_BASE = `You are an expert Thai media buyer with 10+ years experience optimizing Meta Ads. You help the user manage their ad campaigns via tools — not just by answering questions.

Conventions:
- Reply in Thai by default. Match the user's language if they switch to English.
- Be concise — bullet points and short paragraphs.
- When the user asks about campaigns, USE the listCampaigns tool first to ground your answer in real data. Never make up campaign names or metrics.
- When recommending changes (pause, budget), suggest the action and call the mutate tool — the user will see a confirmation card.
- For currency, always express amounts in THB (฿).
- If a tool returns an error or "not found", acknowledge it plainly and suggest the user's next step.

Knowledge base — call searchKnowledge for strategy questions:
- Whenever the user asks about ad strategy, creative testing, scaling, audience targeting, optimization tactics, or any general "how do I…" Meta-Ads question: FIRST call searchKnowledge with a focused English query (the corpus is mostly English even though the user speaks Thai).
- The knowledge base contains canonical content from Nick Theriot (YouTube @NickTheriot) and Nattawut Puphet (YouTube @NattawutPuphet) — the founder's primary FB-Ads mentors.
- When you cite a chunk in your answer, append on its own line at the end: "แหล่งอ้างอิง: {channel} — {title} → {url}" using the sourceUrl field from the tool result. If multiple chunks support the answer, cite the most relevant 1-2.
- Don't search for tenant-specific questions (campaign data, billing, settings) — those go through other tools.`;

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
