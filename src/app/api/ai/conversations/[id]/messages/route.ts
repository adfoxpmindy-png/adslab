import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { sendMessage } from "@/lib/ai/chat-service";
import { requireFeature, FeatureGateError, gateErrorToResponse } from "@/lib/billing/gate";
import { recordAiUsage } from "@/lib/billing/usage";
import { resolveUserLocale } from "@/lib/i18n/server";

/**
 * GET  /api/ai/conversations/[id]/messages?tenantSlug=  → full transcript
 * POST /api/ai/conversations/[id]/messages?tenantSlug=  → send message, run tool loop, return final assistant turn
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug);

  const conv = await prisma.aIConversation.findFirst({
    where: { id, tenantId: tenant.id, userId: session.userId },
    select: { id: true },
  });
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const messages = await prisma.aIMessage.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      content: true,
      toolCalls: true,
      pendingAction: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ messages });
}

const sendSchema = z.object({
  message: z.string().min(1).max(4000),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug);

  const body = await request.json().catch(() => ({}));
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const conv = await prisma.aIConversation.findFirst({
    where: { id, tenantId: tenant.id, userId: session.userId },
    select: { id: true },
  });
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Phase 9 gate: AI chat + daily message cap.
  const locale = await resolveUserLocale(session.userId);
  try {
    await requireFeature(tenant.id, "ai-chat", locale);
    await requireFeature(tenant.id, "ai-chat-msg", locale, { delta: 1 });
  } catch (err) {
    if (err instanceof FeatureGateError) return gateErrorToResponse(err);
    throw err;
  }

  try {
    const result = await sendMessage({
      tenantId: tenant.id,
      userId: session.userId,
      conversationId: id,
      userMessage: parsed.data.message,
    });
    // Best-effort usage record — don't fail the request if metering fails.
    try {
      const tokensIn =
        (result as { tokensIn?: number } | null)?.tokensIn ?? 0;
      const tokensOut =
        (result as { tokensOut?: number } | null)?.tokensOut ?? 0;
      await recordAiUsage({
        tenantId: tenant.id,
        inputTokens: tokensIn,
        outputTokens: tokensOut,
      });
    } catch (meterErr) {
      console.warn("[ai usage] meter failed:", meterErr);
    }
    return NextResponse.json(result);
  } catch (err) {
    const e = err as Error;
    console.error("[ai chat] failed:", e);
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
