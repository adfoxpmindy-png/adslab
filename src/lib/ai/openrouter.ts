import OpenAI from "openai";

// Lazy singleton so non-Next.js contexts (scripts) can load env vars first.
let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set in environment");
  }
  _client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      // OpenRouter recommends these for analytics + rate-limit treatment.
      "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
      "X-Title": "AdsLab",
    },
  });
  return _client;
}

export type AiRole = "analysis" | "chat" | "lite";

const ROLE_ENV: Record<AiRole, string> = {
  analysis: "AI_MODEL_ANALYSIS",
  chat: "AI_MODEL_CHAT",
  lite: "AI_MODEL_LITE",
};

export function getAiModel(role: AiRole): string {
  const envKey = ROLE_ENV[role];
  const model = process.env[envKey];
  if (!model) throw new Error(`${envKey} is not set`);
  return model;
}

export type AiMessage = { role: "user" | "assistant"; content: string };

export type AiChatInput = {
  role: AiRole;
  system?: string;
  messages: AiMessage[];
  /** Enable Anthropic prompt caching for the system prompt (default: true for Claude models). */
  cacheSystem?: boolean;
  temperature?: number;
  maxTokens?: number;
};

export type AiChatResult = {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

/** A single tool definition in OpenAI tool-calling format. */
export type AiTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

/** A tool call returned from the model. */
export type AiToolCall = {
  id: string;
  name: string;
  /** Arguments as a parsed object. We attempt JSON.parse server-side. */
  arguments: Record<string, unknown>;
};

/** Result of a chat turn that may or may not include tool calls. */
export type AiChatTurnResult = {
  content: string | null;
  toolCalls: AiToolCall[];
  model: string;
  usage: AiChatResult["usage"];
  finishReason: string | null;
};

/** Message format including tool turns for the multi-turn tool loop. */
export type AiToolMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: AiToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

/**
 * Unified chat call that routes to the configured model for the given role.
 *
 * - `analysis` → heavy reasoning (Claude Sonnet by default)
 * - `chat`     → fast conversation (Gemini Flash)
 * - `lite`     → cheap classification/labelling (Gemini Flash Lite)
 *
 * For Anthropic models, prompt caching is automatically applied to the system
 * prompt (saves ~70-90% on repeated input tokens). Pass `cacheSystem: false`
 * to disable for tiny one-off prompts.
 */
export async function aiChat(input: AiChatInput): Promise<AiChatResult> {
  const client = getClient();
  const model = getAiModel(input.role);
  const isAnthropic = model.startsWith("anthropic/");
  const shouldCache = isAnthropic && (input.cacheSystem ?? true);

  const messages: unknown[] = [];

  if (input.system) {
    if (shouldCache) {
      // OpenRouter passes `cache_control` through to Anthropic models.
      messages.push({
        role: "system",
        content: [
          {
            type: "text",
            text: input.system,
            cache_control: { type: "ephemeral" },
          },
        ],
      });
    } else {
      messages.push({ role: "system", content: input.system });
    }
  }

  for (const msg of input.messages) {
    messages.push({ role: msg.role, content: msg.content });
  }

  const response = await client.chat.completions.create({
    model,
    messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    temperature: input.temperature,
    max_tokens: input.maxTokens,
  });

  const choice = response.choices[0];
  if (!choice?.message?.content) {
    throw new Error(`AI response missing content (model: ${model})`);
  }

  return {
    content: choice.message.content,
    model,
    usage: {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    },
  };
}

/**
 * Tool-enabled chat call. Mirrors `aiChat` but takes a tool list and
 * preserves the model's tool_calls in the response so the caller can
 * dispatch them and feed the results back on the next turn.
 *
 * Caller is responsible for the loop: if `toolCalls` is non-empty,
 * execute each, push `{ role: "tool", toolCallId, content: JSON }`
 * entries, and call again.
 */
export async function aiChatWithTools(input: {
  role: AiRole;
  system?: string;
  messages: AiToolMessage[];
  tools: AiTool[];
  toolChoice?: "auto" | "none" | "required";
  temperature?: number;
  maxTokens?: number;
  cacheSystem?: boolean;
}): Promise<AiChatTurnResult> {
  const client = getClient();
  const model = getAiModel(input.role);
  const isAnthropic = model.startsWith("anthropic/");
  const shouldCache = isAnthropic && (input.cacheSystem ?? true);

  const messages: unknown[] = [];

  if (input.system) {
    if (shouldCache) {
      messages.push({
        role: "system",
        content: [
          {
            type: "text",
            text: input.system,
            cache_control: { type: "ephemeral" },
          },
        ],
      });
    } else {
      messages.push({ role: "system", content: input.system });
    }
  }

  for (const msg of input.messages) {
    if (msg.role === "user") {
      messages.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      const out: Record<string, unknown> = { role: "assistant" };
      if (msg.content !== null && msg.content !== "") out.content = msg.content;
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        out.tool_calls = msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        }));
      }
      messages.push(out);
    } else if (msg.role === "tool") {
      messages.push({
        role: "tool",
        tool_call_id: msg.toolCallId,
        content: msg.content,
      });
    }
  }

  const response = await client.chat.completions.create({
    model,
    messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    tools: input.tools as OpenAI.Chat.Completions.ChatCompletionTool[],
    tool_choice: input.toolChoice ?? "auto",
    temperature: input.temperature,
    max_tokens: input.maxTokens,
  });

  const choice = response.choices[0];
  if (!choice) {
    throw new Error(`AI returned no choices (model: ${model})`);
  }
  const message = choice.message;

  const toolCalls: AiToolCall[] = (message.tool_calls ?? [])
    .map((tc) => {
      if (tc.type !== "function") return null;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
      } catch {
        // Model produced invalid JSON args — pass empty so handler errors out.
      }
      return { id: tc.id, name: tc.function.name, arguments: args };
    })
    .filter((x): x is AiToolCall => x !== null);

  return {
    content: message.content ?? null,
    toolCalls,
    model,
    usage: {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    },
    finishReason: choice.finish_reason ?? null,
  };
}
