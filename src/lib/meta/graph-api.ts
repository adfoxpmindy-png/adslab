import { MetaApiError, type MetaErrorBody } from "./types";

const BASE_URL = "https://graph.facebook.com";

function getGraphVersion(): string {
  return process.env.META_GRAPH_VERSION ?? "v23.0";
}

type GraphFetchOptions = {
  method?: "GET" | "POST" | "DELETE";
  accessToken?: string;
  searchParams?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
  /** Retry transient + rate-limit errors this many times (default 3, exponential backoff). */
  maxRetries?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Typed wrapper for Meta Graph API calls.
 *
 * - Prepends base + version (e.g. https://graph.facebook.com/v23.0)
 * - Adds `access_token` as a query param when provided
 * - Parses Meta error envelopes → throws `MetaApiError` (with code + subcode)
 * - Retries rate-limited (429 / code 4 / code 17) and transient 5xx
 *   with exponential backoff: 1s, 2s, 4s
 */
export async function graphFetch<T>(path: string, options: GraphFetchOptions = {}): Promise<T> {
  const version = getGraphVersion();
  const url = new URL(`${BASE_URL}/${version}${path.startsWith("/") ? "" : "/"}${path}`);

  if (options.searchParams) {
    for (const [key, value] of Object.entries(options.searchParams)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  if (options.accessToken) {
    url.searchParams.set("access_token", options.accessToken);
  }

  const maxRetries = options.maxRetries ?? 3;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const init: RequestInit = {
        method: options.method ?? "GET",
        headers: { "Content-Type": "application/json" },
      };
      if (options.body !== undefined) {
        init.body = JSON.stringify(options.body);
      }

      const res = await fetch(url.toString(), init);
      const text = await res.text();
      const parsed: unknown = text ? safeJsonParse(text) : null;

      if (!res.ok) {
        if (isMetaErrorBody(parsed)) {
          const apiError = new MetaApiError(parsed, res.status);
          if ((apiError.isRateLimited || apiError.isTransient) && attempt < maxRetries) {
            await sleep(2 ** attempt * 1000);
            continue;
          }
          throw apiError;
        }
        if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
          await sleep(2 ** attempt * 1000);
          continue;
        }
        throw new Error(`Meta API ${res.status}: ${text.slice(0, 200)}`);
      }

      return parsed as T;
    } catch (err) {
      lastError = err;
      if (err instanceof MetaApiError) throw err;
      if (attempt >= maxRetries) throw err;
      await sleep(2 ** attempt * 1000);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isMetaErrorBody(value: unknown): value is MetaErrorBody {
  if (!value || typeof value !== "object") return false;
  const v = value as { error?: unknown };
  if (!v.error || typeof v.error !== "object") return false;
  const e = v.error as { message?: unknown; code?: unknown; type?: unknown };
  return typeof e.message === "string" && typeof e.code === "number" && typeof e.type === "string";
}
