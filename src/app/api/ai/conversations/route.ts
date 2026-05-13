import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { sendMessage } from "@/lib/ai/chat-service";

/**
 * GET  /api/ai/conversations?tenantSlug=...      → list user's threads
 * POST /api/ai/conversations?tenantSlug=...      → create thread (optional initial message)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug);

  const conversations = await prisma.aIConversation.findMany({
    where: { tenantId: tenant.id, userId: session.userId, archived: false },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: {
      id: true,
      title: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });
  return NextResponse.json({ conversations });
}

const createSchema = z.object({
  initialMessage: z.string().min(1).max(4000).optional(),
});

export async function POST(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug);

  const body = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const conv = await prisma.aIConversation.create({
    data: {
      tenantId: tenant.id,
      userId: session.userId,
      title: parsed.data.initialMessage
        ? parsed.data.initialMessage.slice(0, 60)
        : "New conversation",
    },
  });

  if (parsed.data.initialMessage) {
    const result = await sendMessage({
      tenantId: tenant.id,
      userId: session.userId,
      conversationId: conv.id,
      userMessage: parsed.data.initialMessage,
    });
    // `result.conversationId` is already conv.id — no need to merge.
    return NextResponse.json(result);
  }

  return NextResponse.json({ conversationId: conv.id });
}
