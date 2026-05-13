import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import {
  performCampaignAction,
  type PerformActionInput,
} from "@/lib/meta/campaign-actions";
import { duplicateCampaign } from "@/lib/meta/duplicate-campaign";
import type { ValidatedSuggestion } from "@/lib/reports/extract-actions";

const bodySchema = z.object({
  reportId: z.string().min(1),
  suggestionId: z.string().min(1),
  decision: z.enum(["apply", "dismiss"]),
});

/**
 * POST /api/reports/suggestion?tenantSlug=<slug>
 * Body: { reportId, suggestionId, decision: "apply" | "dismiss" }
 *
 * Updates the suggestion's status inside DailyReport.suggestedActions.
 * For "apply" we also invoke the Meta API via performCampaignAction.
 *
 * OWNER + MEDIA_BUYER only.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }

  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const { reportId, suggestionId, decision } = parsed.data;

  const report = await prisma.dailyReport.findFirst({
    where: { id: reportId, tenantId: tenant.id },
    select: { id: true, suggestedActions: true },
  });
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const suggestions = (report.suggestedActions as ValidatedSuggestion[] | null) ?? [];
  const idx = suggestions.findIndex((s) => s.id === suggestionId);
  if (idx === -1) {
    return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
  }
  const suggestion = suggestions[idx];

  if (suggestion.status !== "pending" && decision === "apply") {
    return NextResponse.json(
      { error: `Suggestion already ${suggestion.status}` },
      { status: 409 },
    );
  }

  // Dismiss is a pure metadata update — no Meta API call.
  if (decision === "dismiss") {
    suggestions[idx] = { ...suggestion, status: "dismissed" };
    await prisma.dailyReport.update({
      where: { id: report.id },
      data: { suggestedActions: suggestions as unknown as object },
    });
    return NextResponse.json({ suggestion: suggestions[idx] });
  }

  // Apply: route to the right service based on action type. DUPLICATE
  // creates a new entity so it uses a different service + returns a
  // newCampaignId we want to surface in the UI.
  let result:
    | { ok: true; logId: string; newCampaignName?: string }
    | { ok: false; error: string; logId: string | null };
  if (suggestion.action === "DUPLICATE") {
    const dup = await duplicateCampaign({
      tenantId: tenant.id,
      userId: session.userId,
      sourceCampaignId: suggestion.internalCampaignId,
      newName: suggestion.params?.newName,
      dailyBudget: suggestion.params?.dailyBudget,
      lifetimeBudget: suggestion.params?.lifetimeBudget,
      dailyBudgetMultiplier: suggestion.params?.dailyBudgetMultiplier,
      lifetimeBudgetMultiplier: suggestion.params?.lifetimeBudgetMultiplier,
      initialStatus: suggestion.params?.initialStatus ?? "PAUSED",
    });
    result = dup.ok
      ? { ok: true, logId: dup.logId, newCampaignName: dup.name }
      : { ok: false, error: dup.error, logId: dup.logId };
  } else {
    let actionInput: PerformActionInput;
    if (suggestion.action === "PAUSE" || suggestion.action === "RESUME") {
      actionInput = {
        tenantId: tenant.id,
        userId: session.userId,
        campaignId: suggestion.internalCampaignId,
        action: suggestion.action,
      };
    } else if (suggestion.action === "SET_BUDGET") {
      actionInput = {
        tenantId: tenant.id,
        userId: session.userId,
        campaignId: suggestion.internalCampaignId,
        action: "SET_BUDGET",
        dailyBudget: suggestion.params?.dailyBudget,
        lifetimeBudget: suggestion.params?.lifetimeBudget,
      };
    } else {
      actionInput = {
        tenantId: tenant.id,
        userId: session.userId,
        campaignId: suggestion.internalCampaignId,
        action: "SET_END_DATE",
        endTime: new Date(suggestion.params!.endTime!),
      };
    }
    result = await performCampaignAction(actionInput);
  }

  // Always re-fetch the array — performCampaignAction could have a
  // long Meta call and racing applies on the same report shouldn't
  // clobber each other.
  const freshReport = await prisma.dailyReport.findUnique({
    where: { id: report.id },
    select: { suggestedActions: true },
  });
  const freshArr = (freshReport?.suggestedActions as ValidatedSuggestion[] | null) ?? suggestions;
  const freshIdx = freshArr.findIndex((s) => s.id === suggestionId);
  if (freshIdx === -1) {
    return NextResponse.json({ error: "Suggestion vanished" }, { status: 410 });
  }

  if (result.ok) {
    freshArr[freshIdx] = {
      ...freshArr[freshIdx],
      status: "applied",
      appliedLogId: result.logId,
      errorMessage: undefined,
      newCampaignName: "newCampaignName" in result ? result.newCampaignName : undefined,
    };
  } else {
    // Stay "pending" but remember the error so the UI can show it
    // and the user can retry.
    freshArr[freshIdx] = {
      ...freshArr[freshIdx],
      status: "pending",
      errorMessage: result.error,
    };
  }
  await prisma.dailyReport.update({
    where: { id: report.id },
    data: { suggestedActions: freshArr as unknown as object },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, suggestion: freshArr[freshIdx] }, { status: 502 });
  }
  return NextResponse.json({ suggestion: freshArr[freshIdx] });
}
