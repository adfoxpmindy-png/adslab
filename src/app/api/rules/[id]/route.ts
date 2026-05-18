/**
 * /api/rules/[id] — get + update + delete one rule.
 *
 * PATCH supports partial updates (name / enabled / condition / action /
 * targetIds / minIntervalMinutes). Toggling enabled true→false frees
 * a tier-cap slot; toggling false→true re-applies the cap.
 */
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { resolveUserLocale } from "@/lib/i18n/server";
import { maxActiveRulesForPlan } from "@/lib/billing/tier-rules";
import type { PlanKey } from "@/lib/billing/plans";
import {
  ACTIONS,
  METRICS,
  OPS,
} from "@/lib/rules/types";

const conditionSchema = z.object({
  metric: z.enum(METRICS),
  op: z.enum(OPS),
  value: z.number().finite(),
  windowHours: z.union([z.literal(1), z.literal(2), z.literal(6), z.literal(24)]),
  scope: z.enum(["adset", "campaign"]),
});

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  enabled: z.boolean().optional(),
  condition: conditionSchema.optional(),
  action: z.enum(ACTIONS).optional(),
  targetIds: z.array(z.string()).optional(),
  minIntervalMinutes: z
    .union([z.literal(60), z.literal(360), z.literal(720), z.literal(1440)])
    .optional(),
});

async function resolveRule(tenantId: string, ruleId: string) {
  return prisma.autoRule.findFirst({ where: { id: ruleId, tenantId } });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  const { tenant } = await requireTenantMember(tenantSlug);
  const rule = await resolveRule(tenant.id, id);
  if (!rule) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ rule });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);
  const existing = await resolveRule(tenant.id, id);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  // If enabling a previously-disabled rule, check tier cap.
  const isEnabling = parsed.data.enabled === true && !existing.enabled;
  if (isEnabling) {
    const sub = await prisma.tenantSubscription.findUnique({
      where: { tenantId: tenant.id },
      select: { plan: { select: { key: true } } },
    });
    const planKey = (sub?.plan?.key as PlanKey | undefined) ?? null;
    const cap = maxActiveRulesForPlan(planKey);
    const activeCount = await prisma.autoRule.count({
      where: { tenantId: tenant.id, enabled: true, NOT: { id } },
    });
    if (activeCount >= cap) {
      const locale = await resolveUserLocale(session.userId);
      const t = await getTranslations({ locale, namespace: "api.rules" });
      return NextResponse.json(
        {
          error: cap === 0 ? "upgrade_required" : "rule_limit_reached",
          message:
            cap === 0
              ? t("planNoActivate")
              : t("limitReachedRules", { cap }),
          limit: cap,
          currentTier: planKey,
        },
        { status: 402 },
      );
    }
  }

  const rule = await prisma.autoRule.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.enabled !== undefined && { enabled: parsed.data.enabled }),
      ...(parsed.data.condition !== undefined && {
        condition: parsed.data.condition as never,
      }),
      ...(parsed.data.action !== undefined && { action: parsed.data.action }),
      ...(parsed.data.targetIds !== undefined && { targetIds: parsed.data.targetIds }),
      ...(parsed.data.minIntervalMinutes !== undefined && {
        minIntervalMinutes: parsed.data.minIntervalMinutes,
      }),
    },
  });
  return NextResponse.json({ rule });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);
  const existing = await resolveRule(tenant.id, id);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.autoRule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export const runtime = "nodejs";
