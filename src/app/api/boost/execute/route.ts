import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { executeBriefs } from "@/lib/boost/execute";
import type { BoostBrief } from "@/lib/boost/brief-builder";

const briefSchema = z.object({
  briefId: z.string(),
  resolved: z.object({
    originalUrl: z.string(),
    canonicalUrl: z.string(),
    pageId: z.string(),
    pageName: z.string(),
    postId: z.string(),
    mediaType: z.enum(["reel", "video", "image", "text", "unknown"]),
    permalinkUrl: z.string(),
  }),
  metaAccountId: z.string().min(1),
  accountName: z.string(),
  campaignName: z.string().min(1),
  objective: z.enum([
    "OUTCOME_AWARENESS",
    "OUTCOME_ENGAGEMENT",
    "OUTCOME_TRAFFIC",
    "OUTCOME_LEADS",
    "OUTCOME_SALES",
    "OUTCOME_APP_PROMOTION",
  ]),
  optimizationGoal: z.string(),
  billingEvent: z.string(),
  lifetimeBudgetThb: z.number().positive(),
  startTime: z.string().datetime().or(z.date()),
  endTime: z.string().datetime().or(z.date()),
  kpi: z.unknown().nullable(),
  purpose: z.string().nullable(),
  warnings: z.array(z.string()),
});

const bodySchema = z.object({
  jobId: z.string().min(1),
  initialStatus: z.enum(["PAUSED", "ACTIVE"]),
  briefs: z.array(briefSchema).min(1),
});

/**
 * POST /api/boost/execute?tenantSlug=<slug>
 *
 * Body:
 *   {
 *     jobId: string,
 *     initialStatus: "PAUSED" | "ACTIVE",
 *     briefs: BoostBrief[]   // potentially edited from planned version
 *   }
 *
 * Roles: OWNER + MEDIA_BUYER. Always tied to a planned BoostJob.
 *
 * For "ACTIVE" status, this is when money starts flowing — the UI MUST
 * have already gated on KPI/purpose being present + a confirmation
 * checkbox before reaching this endpoint.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }

  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  // Verify the job exists + belongs to this tenant.
  const job = await prisma.boostJob.findFirst({
    where: { id: parsed.data.jobId, tenantId: tenant.id },
    select: { id: true, status: true },
  });
  if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });
  if (job.status !== "planned") {
    return NextResponse.json(
      { error: `job is already ${job.status}` },
      { status: 409 },
    );
  }

  // Coerce date strings → Date for the executor
  const briefs: BoostBrief[] = parsed.data.briefs.map((b) => ({
    ...b,
    startTime: b.startTime instanceof Date ? b.startTime : new Date(b.startTime),
    endTime: b.endTime instanceof Date ? b.endTime : new Date(b.endTime),
    kpi: b.kpi as BoostBrief["kpi"],
  }));

  const results = await executeBriefs({
    tenantId: tenant.id,
    userId: session.userId,
    jobId: parsed.data.jobId,
    briefs,
    initialStatus: parsed.data.initialStatus,
  });

  return NextResponse.json({ ok: true, results });
}

export const runtime = "nodejs";
export const maxDuration = 60;
