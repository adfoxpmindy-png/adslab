import { NextResponse } from "next/server";

import { resolveMcpAuth } from "@/lib/meta-mcp/auth";
import {
  buildErrorResponse,
  dispatchMcp,
  JSON_RPC_ERRORS,
  type JsonRpcId,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "@/lib/meta-mcp/handler";

/**
 * POST /api/mcp — Model Context Protocol JSON-RPC 2.0 endpoint.
 *
 * Called by MCP clients (e.g. Claude Desktop) over HTTP. Auth is a
 * per-tenant Bearer key issued via `scripts/mcp-issue-key.ts` and stored
 * SHA-256-hashed in `Tenant.mcpApiKey`. The endpoint resolves the key to
 * a tenant, decrypts that tenant's Meta access token, and dispatches the
 * request to the meta-mcp router.
 *
 * The proxy matcher in `src/proxy.ts` excludes `/api/**`, so this route
 * is NOT subject to the session-cookie check (Claude Desktop cannot send
 * an iron-session cookie).
 *
 * Supports both single JSON-RPC requests `{jsonrpc, id, method, ...}`
 * and batch arrays `[{...}, {...}]`. Notifications (requests with no
 * `id`) are executed but produce no response, per the JSON-RPC 2.0 spec.
 */

// Meta API calls can take multiple seconds (esp. insights with big time
// ranges). Bump beyond the Vercel Hobby 10s default so `tools/call`
// requests don't get killed mid-flight.
export const maxDuration = 60;

// Force Node.js runtime — `node:crypto` (HKDF/AES/SHA-256) is used by
// `@/lib/crypto/aes` and `@/lib/meta-mcp/auth`, and the Prisma Neon
// adapter is Node-only.
export const runtime = "nodejs";

// MCP requests are inherently dynamic (auth header + per-call args); do
// not attempt to statically render or cache them.
export const dynamic = "force-dynamic";

// ---------- Helpers ----------

function isJsonRpcMessage(value: unknown): value is JsonRpcRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { jsonrpc?: unknown }).jsonrpc === "2.0" &&
    typeof (value as { method?: unknown }).method === "string"
  );
}

/** Peek at a raw parsed body to extract an `id` for error-response framing. */
function peekId(value: unknown): JsonRpcId {
  if (value && typeof value === "object" && "id" in value) {
    const raw = (value as { id?: unknown }).id;
    if (typeof raw === "string" || typeof raw === "number" || raw === null) return raw;
  }
  return null;
}

function jsonRpcErrorResponse(id: JsonRpcId, code: number, message: string, httpStatus: number): NextResponse {
  return NextResponse.json(buildErrorResponse(id, code, message), { status: httpStatus });
}

// ---------- Route handler ----------

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Parse body FIRST so we can echo an `id` in any error response.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonRpcErrorResponse(null, JSON_RPC_ERRORS.PARSE_ERROR, "Request body is not valid JSON", 400);
  }

  // 2. Authenticate. We do this before dispatching so an invalid key
  // never touches the Meta API. Auth failures are surfaced as JSON-RPC
  // errors with HTTP 401 so MCP clients treat them as recoverable.
  const auth = await resolveMcpAuth(request.headers.get("authorization"));
  if (!auth.ok) {
    const id = Array.isArray(body) ? null : peekId(body);
    const httpStatus =
      auth.reason === "missing_bearer" || auth.reason === "invalid_key"
        ? 401
        : auth.reason === "no_meta_connection"
        ? 409
        : 500;
    return jsonRpcErrorResponse(id, JSON_RPC_ERRORS.UNAUTHORIZED, auth.message, httpStatus);
  }

  const ctx = { metaAccessToken: auth.metaAccessToken };

  // 3. Batch request?
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return jsonRpcErrorResponse(null, JSON_RPC_ERRORS.INVALID_REQUEST, "Batch request must not be empty", 400);
    }
    const responses: JsonRpcResponse[] = [];
    for (const entry of body) {
      if (!isJsonRpcMessage(entry)) {
        responses.push(buildErrorResponse(peekId(entry), JSON_RPC_ERRORS.INVALID_REQUEST, "Invalid JSON-RPC 2.0 request"));
        continue;
      }
      const resp = await dispatchMcp(entry, ctx);
      if (resp !== null) responses.push(resp);
    }
    // Per spec: if every message in a batch was a notification (nothing
    // to return), respond with 204 No Content.
    if (responses.length === 0) return new NextResponse(null, { status: 204 });
    return NextResponse.json(responses);
  }

  // 4. Single request.
  if (!isJsonRpcMessage(body)) {
    return jsonRpcErrorResponse(peekId(body), JSON_RPC_ERRORS.INVALID_REQUEST, "Invalid JSON-RPC 2.0 request", 400);
  }

  const response = await dispatchMcp(body, ctx);
  if (response === null) {
    // Notification (no `id`) — spec says respond with no body.
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json(response);
}

/**
 * GET /api/mcp — small liveness probe so operators (and MCP client
 * transport auto-discovery) can confirm the endpoint exists without
 * needing a valid key. Intentionally does NOT read the Authorization
 * header or touch the database — this must stay cheap and public.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ok: true,
    protocol: "mcp",
    transport: "http-jsonrpc-2.0",
    method: "POST",
    hint: "Send JSON-RPC 2.0 requests with 'Authorization: Bearer <tenant-mcp-key>'",
  });
}
