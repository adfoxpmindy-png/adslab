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
