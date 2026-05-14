/**
 * Plan a boost job: parse prompt → resolve URLs → build briefs.
 * Persists a `BoostJob` row in "planned" state for audit + retrieval.
 */
import { prisma } from "@/lib/prisma";
import { getConnection, getFreshAccessToken } from "@/lib/meta/client";
import { parseBoostPrompt, type BoostIntent } from "@/lib/ai/boost-parser";
import { extractUrls, resolveAllUrls, type ResolveError } from "@/lib/meta/url-resolver";

import { buildBriefs, type BoostBrief } from "./brief-builder";

export type PlanResult =
  | {
      ok: true;
      jobId: string;
      intent: BoostIntent;
      briefs: BoostBrief[];
      urlErrors: ResolveError[];
    }
  | { ok: false; error: string; stage: "parse" | "no-urls" | "no-connection" | "resolve" };

export async function planBoost(args: {
  tenantId: string;
  userId: string;
  promptText: string;
}): Promise<PlanResult> {
  const { tenantId, userId, promptText } = args;

  const parsed = await parseBoostPrompt(promptText);
  if (!parsed.ok) {
    return { ok: false, stage: "parse", error: parsed.error };
  }

  const urls = extractUrls(promptText);
  if (urls.length === 0) {
    return { ok: false, stage: "no-urls", error: "ไม่พบลิงก์ Facebook ในข้อความ" };
  }

  const connection = await getConnection(tenantId);
  if (!connection || connection.status !== "ACTIVE") {
    return { ok: false, stage: "no-connection", error: "Meta connection ไม่ active" };
  }
  const accessToken = await getFreshAccessToken(connection);
  const { resolved, errors: urlErrors } = await resolveAllUrls({ urls, accessToken });

  if (resolved.length === 0) {
    return { ok: false, stage: "resolve", error: "resolve URL ไม่สำเร็จเลย" };
  }

  // Default ad account per page (first active). UI lets user override.
  const accounts = await prisma.metaAdAccount.findMany({
    where: { metaConnectionId: connection.id, accountStatus: 1 },
    orderBy: { name: "asc" },
    select: { metaAccountId: true, name: true },
  });
  const defaultAccount = accounts[0];
  const accountByPageId = new Map<string, { metaAccountId: string; name: string }>();
  for (const r of resolved) {
    if (defaultAccount) {
      accountByPageId.set(r.pageId, {
        metaAccountId: defaultAccount.metaAccountId,
        name: defaultAccount.name,
      });
    }
  }

  const briefs = buildBriefs({ intent: parsed.intent, resolvedUrls: resolved, accountByPageId });

  const job = await prisma.boostJob.create({
    data: {
      tenantId,
      userId,
      promptText,
      parsedBrief: { intent: parsed.intent, briefs } as unknown as object,
      status: "planned",
      kpiText: parsed.intent.kpi ? formatKpi(parsed.intent.kpi) : null,
      purposeText: parsed.intent.purpose,
    },
    select: { id: true },
  });

  return { ok: true, jobId: job.id, intent: parsed.intent, briefs, urlErrors };
}

function formatKpi(kpi: NonNullable<BoostIntent["kpi"]>): string {
  const dirTh = kpi.direction === "at_least" ? "ขั้นต่ำ" : kpi.direction === "at_most" ? "ไม่เกิน" : "";
  if (kpi.target !== null) {
    return `${kpi.type.toUpperCase()} ${dirTh} ${kpi.target.toLocaleString("en-US")}${kpi.unit ? " " + kpi.unit : ""}`.trim();
  }
  return kpi.type.toUpperCase();
}
