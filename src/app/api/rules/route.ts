/**
 * /api/rules — list + create.
 *
 * Tier-gated: starter+ can create. Disabled rules don't count toward
 * the cap.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { maxActiveRulesForPlan } from "@/lib/billing/tier-rules";
import type { PlanKey } from "@/lib/billing/plans";
import {
  ACTIONS,
  METRICS,
  MIN_INTERVAL_MINUTES,
  OPS,
  WINDOWS,
} from "@/lib/rules/types";

const conditionSchema = z.object({
  metric: z.enum(METRICS),
  op: z.enum(OPS),
  value: z.number().finite(),
  windowHours: z.union([z.literal(1), z.literal(2), z.literal(6), z.literal(24)]),
  scope: z.enum(["adset", "campaign"]),
});

const createSchema = z.object({
  name: z.string().min(1).max(120),
  condition: conditionSchema,
  action: z.enum(ACTIONS),
  targetIds: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  minIntervalMinutes: z
    .union([z.literal(60), z.literal(360), z.literal(720), z.literal(1440)])
    .default(60),
});

/** GET — list all rules for the tenant (any role can read). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  const { tenant } = await requireTenantMember(tenantSlug);

  const rules = await prisma.autoRule.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
  });
  const activeCount = rules.filter((r) => r.enabled).length;
  const sub = await prisma.tenantSubscription.findUnique({
    where: { tenantId: tenant.id },
    select: { plan: { select: { key: true } } },
  });
  const planKey = (sub?.plan?.key as PlanKey | undefined) ?? null;
  const cap = maxActiveRulesForPlan(planKey);
  return NextResponse.json({
    rules,
    activeCount,
    cap,
    planKey,
    canCreateMore: activeCount < cap,
  });
}

/** POST — create a new rule. OWNER + MEDIA_BUYER only. Tier-cap enforced. */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  // Enforce tier cap on active rule count.
  const sub = await prisma.tenantSubscription.findUnique({
    where: { tenantId: tenant.id },
    select: { plan: { select: { key: true } } },
  });
  const planKey = (sub?.plan?.key as PlanKey | undefined) ?? null;
  const cap = maxActiveRulesForPlan(planKey);
  if (parsed.data.enabled) {
    const activeCount = await prisma.autoRule.count({
      where: { tenantId: tenant.id, enabled: true },
    });
    if (cap === 0) {
      return NextResponse.json(
        {
          error: "upgrade_required",
          message: "Auto-rules ต้องการ plan แบบจ่ายเงินขั้นต่ำ Starter",
          currentTier: planKey ?? "trial",
          requiredTier: "starter",
        },
        { status: 402 },
      );
    }
    if (activeCount >= cap) {
      return NextResponse.json(
        {
          error: "rule_limit_reached",
          message: `ถึง limit ${cap} rules ของ plan แล้ว — disabled หรือลบ rule เก่า หรือ upgrade plan`,
          limit: cap,
          currentTier: planKey,
        },
        { status: 402 },
      );
    }
  }

  const rule = await prisma.autoRule.create({
    data: {
      tenantId: tenant.id,
      createdByUserId: session.userId,
      name: parsed.data.name,
      condition: parsed.data.condition as never,
      action: parsed.data.action,
      targetIds: parsed.data.targetIds,
      enabled: parsed.data.enabled,
      minIntervalMinutes: parsed.data.minIntervalMinutes,
    },
  });
  return NextResponse.json({ rule }, { status: 201 });
}

export const runtime = "nodejs";
