import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { continueAfterConfirmation } from "@/lib/ai/chat-service";

/**
 * POST /api/ai/conversations/[id]/confirm?tenantSlug=...
 * Body: { messageId, decision: "approve" | "reject" }
 *
 * User clicked Confirm or Cancel on a pending mutate-tool card. We
 * execute (or skip) the tool, then resume the AI loop so it can
 * respond to the result.
 */
const schema = z.object({
  messageId: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
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
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  // Verify ownership of conversation
  const conv = await prisma.aIConversation.findFirst({
    where: { id, tenantId: tenant.id, userId: session.userId },
    select: { id: true },
  });
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const result = await continueAfterConfirmation({
      tenantId: tenant.id,
      userId: session.userId,
      conversationId: id,
      pendingMessageId: parsed.data.messageId,
      decision: parsed.data.decision,
    });
    return NextResponse.json(result);
  } catch (err) {
    const e = err as Error;
    console.error("[ai confirm] failed:", e);
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
