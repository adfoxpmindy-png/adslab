# Spec: AI Gateway

**Capability:** Single entry point for all LLM calls in AdsLab. Routes work to the right model based on task type. Caching is automatic for supported providers.

## Why a gateway

- Founder pays one OpenRouter bill, not N provider bills
- Switching model = changing one env var, no code change
- Prompt caching configuration is enforced in one place
- Phase-2 features (rate limiting, tenant quotas, cost tracking) plug in here

## Roles

| Role | Purpose | Default model env var |
|------|---------|----------------------|
| `analysis` | Heavy reasoning — Daily Report, Optimization Recommendations | `AI_MODEL_ANALYSIS` (default `anthropic/claude-sonnet-4.6`) |
| `chat` | In-app conversation — campaign Q&A | `AI_MODEL_CHAT` (default `google/gemini-2.0-flash-001`) |
| `lite` | Classification, labelling, cheap one-shots | `AI_MODEL_LITE` (default `google/gemini-2.0-flash-lite-001`) |

Adding a new role requires extending `AiRole` type + env var + this spec.

## Contract — `aiChat(input: AiChatInput): Promise<AiChatResult>`

```ts
type AiChatInput = {
  role: AiRole;
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  cacheSystem?: boolean;   // default: true for Anthropic models, false otherwise
  temperature?: number;
  maxTokens?: number;
};
type AiChatResult = {
  content: string;
  model: string;            // actual model slug used
  usage: { promptTokens, completionTokens, totalTokens };
};
```

## Invariants

- All AI features in AdsLab MUST call `aiChat()` from `src/lib/ai/openrouter.ts`. Direct imports of `openai`, `@anthropic-ai/sdk`, `@google/generative-ai`, etc. are FORBIDDEN outside `src/lib/ai/`.
- When the resolved model starts with `anthropic/`, the system prompt MUST be wrapped in a `cache_control: { type: "ephemeral" }` content block unless `cacheSystem: false` is explicitly set.
- HTTP headers MUST include `HTTP-Referer: <APP_URL>` and `X-Title: AdsLab` for OpenRouter analytics + rate-limit treatment.
- The OpenRouter API key MUST be loaded lazily inside the function — never at module top level — so script and test contexts can load `.env.local` before construction.

## Acceptance criteria

- [x] `aiChat({ role: "analysis", ... })` → uses `claude-sonnet-4-6` (or whatever `AI_MODEL_ANALYSIS` is set to)
- [x] `aiChat({ role: "chat", ... })` → uses Gemini 2.0 Flash
- [x] System prompt for Anthropic models is sent as a content array with `cache_control`
- [x] Function throws clearly on missing `OPENROUTER_API_KEY` or unknown role
- [x] `usage` field is populated from `response.usage` when the provider returns it
- [x] All three role smoke tests pass in Thai (verified via one-off script)

## Cost & ops

- Default Phase 1 budget: ~$130/month (founder use, 31 ad accounts)
- Monitor at [openrouter.ai/activity](https://openrouter.ai/activity)
- Hard cost cap: set a spending limit on OpenRouter dashboard
- When per-customer cost tracking is added (Phase 2 billing), it lives in this gateway

## Out of scope

- Streaming responses (add when needed for chat UI)
- Tool use / function calling (Phase 2+ for autonomous actions)
- Embedding models (different concern, separate spec when added)
