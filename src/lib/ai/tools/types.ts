import type { ZodTypeAny, infer as ZodInfer } from "zod";

/**
 * Tool framework for AI Master (Phase 7).
 *
 * Two kinds of tools:
 *   - `read`   — auto-execute when AI invokes them. No user friction.
 *   - `mutate` — surface a "AI wants to do X" confirmation card in the
 *     chat UI. User taps Confirm before we hit Meta. Every executed
 *     mutate writes an audit log row.
 *
 * Each tool defines:
 *   - JSON-Schema-style description for Claude to understand when to call it
 *   - Zod schema for runtime validation of the AI's `input` object
 *   - Handler that runs server-side with full tenant context
 *   - `summarize` returns the user-facing one-liner shown in the
 *     confirmation card (mutate tools only).
 */

export type ToolKind = "read" | "mutate";

export type ToolContext = {
  tenantId: string;
  userId: string;
  conversationId: string;
};

// `S` (zod schema) → input type via z.infer; output is whatever the handler returns.
export type ToolDef<S extends ZodTypeAny = ZodTypeAny, O = unknown> = {
  name: string;
  description: string;
  kind: ToolKind;
  /** JSON-Schema for Claude/OpenAI tool API. Derived from the zod schema. */
  jsonSchema: Record<string, unknown>;
  inputSchema: S;
  handler: (input: ZodInfer<S>, ctx: ToolContext) => Promise<O>;
  /**
   * Short human-readable summary of what the tool call WILL do.
   * Used in the confirmation card for mutate tools, and as a fallback
   * "calling X(...)" label for read tools while they execute.
   */
  summarize: (input: ZodInfer<S>) => string;
};

/** Helper to declare a tool with full type inference. */
export function defineTool<S extends ZodTypeAny, O>(def: ToolDef<S, O>): ToolDef<S, O> {
  return def;
}
