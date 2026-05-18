/**
 * Plan a boost job: parse prompt → resolve URLs → build briefs.
 * Persists a `BoostJob` row in "planned" state for audit + retrieval.
 */
import { getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { getConnection, getFreshAccessToken } from "@/lib/meta/client";
import { parseBoostPrompt, type BoostIntent } from "@/lib/ai/boost-parser";
import { extractUrls, resolveAllUrls, type ResolveError } from "@/lib/meta/url-resolver";
import { resolveUserLocale } from "@/lib/i18n/server";

import { buildBriefs, type BoostBrief } from "./brief-builder";
import { resolvePageToAccount } from "./page-account-resolver";

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

  const locale = await resolveUserLocale(userId);
  const t = await getTranslations({ locale, namespace: "api.boost.plan" });

  const parsed = await parseBoostPrompt(promptText);
  if (!parsed.ok) {
    return { ok: false, stage: "parse", error: parsed.error };
  }

  const urls = extractUrls(promptText);
  if (urls.length === 0) {
    return { ok: false, stage: "no-urls", error: t("noFacebookLinks") };
  }

  const connection = await getConnection(tenantId);
  if (!connection || connection.status !== "ACTIVE") {
    return { ok: false, stage: "no-connection", error: t("connectionInactive") };
  }
  const accessToken = await getFreshAccessToken(connection);
  const { resolved, errors: urlErrors } = await resolveAllUrls({ urls, accessToken, locale });

  if (resolved.length === 0) {
    return { ok: false, stage: "resolve", error: t("resolveFailed") };
  }

  // For each resolved Page, find the ad account that has permission to
  // promote its posts. Querying /act_xxx/promote_pages on every active
  // ad account in parallel is the only reliable signal — Meta doesn't
  // expose this mapping any other way.
  const accountByPageId = await resolvePageToAccount({
    metaConnectionId: connection.id,
    pageIds: [...new Set(resolved.map((r) => r.pageId))],
    accessToken,
  });

  const briefs = await buildBriefs({ intent: parsed.intent, resolvedUrls: resolved, accountByPageId, locale });

  const job = await prisma.boostJob.create({
    data: {
      tenantId,
      userId,
      promptText,
      parsedBrief: { intent: parsed.intent, briefs } as unknown as object,
      status: "planned",
      kpiText: parsed.intent.kpi
        ? await formatKpi(parsed.intent.kpi, locale)
        : null,
      purposeText: parsed.intent.purpose,
    },
    select: { id: true },
  });

  return { ok: true, jobId: job.id, intent: parsed.intent, briefs, urlErrors };
}

async function formatKpi(
  kpi: NonNullable<BoostIntent["kpi"]>,
  locale: Awaited<ReturnType<typeof resolveUserLocale>>,
): Promise<string> {
  const tKpi = await getTranslations({ locale, namespace: "api.boost.kpi" });
  const dir =
    kpi.direction === "at_least"
      ? tKpi("atLeast")
      : kpi.direction === "at_most"
        ? tKpi("atMost")
        : "";
  if (kpi.target !== null) {
    return `${kpi.type.toUpperCase()} ${dir} ${kpi.target.toLocaleString("en-US")}${kpi.unit ? " " + kpi.unit : ""}`.trim();
  }
  return kpi.type.toUpperCase();
}
