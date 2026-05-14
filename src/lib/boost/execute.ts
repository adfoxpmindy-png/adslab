/**
 * Execute a list of confirmed BoostBriefs in parallel via
 * createCampaignTree. Returns per-brief result so the UI can show
 * mixed success/failure states.
 *
 * Persists results to BoostJob.executionResults for audit.
 */
import { prisma } from "@/lib/prisma";
import { createCampaignTree, type CreateResult } from "@/lib/meta/campaign-create";

import { briefToCreateInput, type BoostBrief } from "./brief-builder";

export type ExecuteResult = {
  briefId: string;
  postId: string;
  pageName: string;
  status: "success" | "failed";
  campaignMetaId?: string;
  campaignInternalId?: string;
  error?: string;
};

export async function executeBriefs(args: {
  tenantId: string;
  userId: string;
  jobId: string;
  briefs: BoostBrief[];
  initialStatus: "PAUSED" | "ACTIVE";
}): Promise<ExecuteResult[]> {
  const { tenantId, userId, jobId, briefs, initialStatus } = args;

  // Mark job as executing
  await prisma.boostJob.update({
    where: { id: jobId },
    data: { status: "executing" },
  });

  const settled = await Promise.allSettled(
    briefs.map((brief) =>
      createCampaignTree(briefToCreateInput({ brief, tenantId, userId, initialStatus })),
    ),
  );

  const results: ExecuteResult[] = settled.map((s, i) => {
    const brief = briefs[i];
    const common = {
      briefId: brief.briefId,
      postId: brief.resolved.postId,
      pageName: brief.resolved.pageName,
    };
    if (s.status === "rejected") {
      return { ...common, status: "failed", error: (s.reason as Error).message };
    }
    const r = s.value as CreateResult;
    if (r.ok) {
      return {
        ...common,
        status: "success",
        campaignMetaId: r.campaign.metaId,
        campaignInternalId: r.campaign.internalId,
      };
    }
    return { ...common, status: "failed", error: `${r.failedAt}: ${r.error}` };
  });

  const allOk = results.every((r) => r.status === "success");
  await prisma.boostJob.update({
    where: { id: jobId },
    data: {
      status: allOk ? "executed" : "failed",
      // Cast: Prisma's Json type accepts the array as-is
      executionResults: results as unknown as object,
      executedAt: new Date(),
    },
  });

  return results;
}
