import { prisma } from "@/lib/prisma";
import { getFreshAccessToken } from "./client";
import { graphFetch } from "./graph-api";
import { invalidateDashboardCache } from "./dashboard-service";
import {
  isCboCampaign,
  thbToMinorUnits,
} from "./campaign-actions";

/**
 * Stage 2 — Duplicate an existing Meta campaign with optional name +
 * budget overrides. Returns the newly-created campaign as visible in
 * AdsLab's DB (we sync immediately so callers can redirect/scroll to it).
 *
 * The Meta `/copies` endpoint deep-copies campaign + ad sets + ads in
 * one call. We optionally chain follow-up POSTs to rename / re-budget /
 * activate the copy before returning.
 *
 * Validation rules mirror SET_BUDGET in campaign-actions.ts:
 *   - Budget overrides require the source to be CBO
 *   - Cannot swap modes (daily ↔ lifetime)
 *   - Multiplier and absolute are mutually exclusive (caller enforces;
 *     this layer trusts the dispatcher)
 *
 * Audit log: writes a single CampaignActionLog row of action=DUPLICATE
 * with afterValue containing the newly-created campaign metadata.
 */

const MIN_BUDGET_THB = 20;
const MAX_BUDGET_THB = 1_000_000;
const MAX_MULTIPLIER = 10;

export type DuplicateInput = {
  tenantId: string;
  userId: string;
  /** Internal MetaCampaign.id (cuid) of the source campaign. */
  sourceCampaignId: string;
  newName?: string;
  /** Absolute new daily budget in THB. */
  dailyBudget?: number;
  /** Absolute new lifetime budget in THB. */
  lifetimeBudget?: number;
  /** Multiplier applied to the source's daily budget (e.g. 1.5 = +50%). */
  dailyBudgetMultiplier?: number;
  /** Multiplier applied to the source's lifetime budget. */
  lifetimeBudgetMultiplier?: number;
  /** Initial status of the duplicate. PAUSED by default for safety. */
  initialStatus?: "PAUSED" | "ACTIVE";
};

export type DuplicateResult =
  | {
      ok: true;
      newCampaignInternalId: string;
      newMetaCampaignId: string;
      name: string;
      status: string;
      logId: string;
    }
  | { ok: false; error: string; logId: string | null };

type MetaCopiesResponse = {
  copied_campaign_id: string;
  ad_object_ids?: Array<{
    ad_object_type: string;
    old_id: string;
    new_id: string;
  }>;
};

type MetaCampaignDetail = {
  id: string;
  name: string;
  effective_status: string;
  configured_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  end_time?: string;
  objective?: string;
};

export async function duplicateCampaign(
  input: DuplicateInput,
): Promise<DuplicateResult> {
  // 1. Resolve source + verify ownership
  const source = await prisma.metaCampaign.findFirst({
    where: { id: input.sourceCampaignId, connection: { tenantId: input.tenantId } },
    select: {
      id: true,
      metaCampaignId: true,
      metaAccountId: true,
      name: true,
      metaConnectionId: true,
      dailyBudget: true,
      lifetimeBudget: true,
    },
  });
  if (!source) {
    return { ok: false, error: "Source campaign not found", logId: null };
  }

  // 2. Validate budget overrides BEFORE calling Meta. A failed validation
  //    is logged as FAILED with no API call.
  const wantsBudgetOverride =
    input.dailyBudget !== undefined ||
    input.lifetimeBudget !== undefined ||
    input.dailyBudgetMultiplier !== undefined ||
    input.lifetimeBudgetMultiplier !== undefined;

  let resolvedDailyBudget: number | undefined;
  let resolvedLifetimeBudget: number | undefined;

  if (wantsBudgetOverride) {
    if (!isCboCampaign(source)) {
      return await logFailure(
        input,
        source,
        "Budget อยู่ที่ระดับ ad set (ABO) — ปรับ budget ตอน duplicate ไม่ได้",
      );
    }
    const isDailyMode = source.dailyBudget !== null;

    if (input.dailyBudget !== undefined && input.dailyBudgetMultiplier !== undefined) {
      return await logFailure(input, source, "ระบุได้แค่อย่างใดอย่างหนึ่ง: dailyBudget หรือ dailyBudgetMultiplier");
    }
    if (input.lifetimeBudget !== undefined && input.lifetimeBudgetMultiplier !== undefined) {
      return await logFailure(input, source, "ระบุได้แค่อย่างใดอย่างหนึ่ง: lifetimeBudget หรือ lifetimeBudgetMultiplier");
    }

    if (isDailyMode) {
      if (input.lifetimeBudget !== undefined || input.lifetimeBudgetMultiplier !== undefined) {
        return await logFailure(input, source, "Source ใช้ daily budget — ใช้ dailyBudget หรือ dailyBudgetMultiplier");
      }
      if (input.dailyBudget !== undefined) {
        resolvedDailyBudget = input.dailyBudget;
      } else if (input.dailyBudgetMultiplier !== undefined) {
        if (!Number.isFinite(input.dailyBudgetMultiplier) || input.dailyBudgetMultiplier <= 0 || input.dailyBudgetMultiplier > MAX_MULTIPLIER) {
          return await logFailure(input, source, `Multiplier ต้องอยู่ระหว่าง 0 ถึง ${MAX_MULTIPLIER}`);
        }
        resolvedDailyBudget = ((source.dailyBudget as number) / 100) * input.dailyBudgetMultiplier;
      }
      if (resolvedDailyBudget !== undefined) {
        if (resolvedDailyBudget < MIN_BUDGET_THB) {
          return await logFailure(input, source, `Budget ต่ำกว่าขั้นต่ำ ฿${MIN_BUDGET_THB}`);
        }
        if (resolvedDailyBudget > MAX_BUDGET_THB) {
          return await logFailure(input, source, `Budget เกินเพดาน ฿${MAX_BUDGET_THB.toLocaleString()}`);
        }
      }
    } else {
      // lifetime mode
      if (input.dailyBudget !== undefined || input.dailyBudgetMultiplier !== undefined) {
        return await logFailure(input, source, "Source ใช้ lifetime budget — ใช้ lifetimeBudget หรือ lifetimeBudgetMultiplier");
      }
      if (input.lifetimeBudget !== undefined) {
        resolvedLifetimeBudget = input.lifetimeBudget;
      } else if (input.lifetimeBudgetMultiplier !== undefined) {
        if (!Number.isFinite(input.lifetimeBudgetMultiplier) || input.lifetimeBudgetMultiplier <= 0 || input.lifetimeBudgetMultiplier > MAX_MULTIPLIER) {
          return await logFailure(input, source, `Multiplier ต้องอยู่ระหว่าง 0 ถึง ${MAX_MULTIPLIER}`);
        }
        resolvedLifetimeBudget = ((source.lifetimeBudget as number) / 100) * input.lifetimeBudgetMultiplier;
      }
      if (resolvedLifetimeBudget !== undefined) {
        if (resolvedLifetimeBudget < MIN_BUDGET_THB) {
          return await logFailure(input, source, `Budget ต่ำกว่าขั้นต่ำ ฿${MIN_BUDGET_THB}`);
        }
        if (resolvedLifetimeBudget > MAX_BUDGET_THB) {
          return await logFailure(input, source, `Budget เกินเพดาน ฿${MAX_BUDGET_THB.toLocaleString()}`);
        }
      }
    }
  }

  // 3. Get fresh access token
  const connection = await prisma.metaConnection.findUnique({
    where: { id: source.metaConnectionId },
    select: {
      id: true,
      tenantId: true,
      accessTokenEncrypted: true,
      tokenExpiresAt: true,
      metaUserId: true,
      metaUserName: true,
      status: true,
      connectedAt: true,
      lastSyncedAt: true,
    },
  });
  if (!connection || connection.status !== "ACTIVE") {
    return await logFailure(input, source, "Meta connection ไม่พร้อมใช้งาน");
  }
  const accessToken = await getFreshAccessToken(connection);

  const initialStatus = input.initialStatus ?? "PAUSED";

  // 4. POST to Meta /copies — deep_copy includes ad sets + ads.
  //    Meta's /copies endpoint expects query-style params, not a JSON
  //    body. rename_options is a JSON-encoded object string.
  let copied: MetaCopiesResponse;
  try {
    copied = await graphFetch<MetaCopiesResponse>(`/${source.metaCampaignId}/copies`, {
      method: "POST",
      accessToken,
      searchParams: {
        deep_copy: "true",
        status_option: initialStatus,
      },
    });
  } catch (err) {
    // Surface Meta's localized error_user_msg if available — it's
    // already in Thai and explains the real reason (e.g. legacy
    // creative restrictions, app-mode mismatch, rate limit). Falls
    // back to error.message for non-Meta errors.
    const e = err as Error & { userMessage?: string };
    return await logFailure(
      input,
      source,
      e.userMessage ?? `Meta copy failed: ${e.message}`,
    );
  }
  const newMetaCampaignId = copied.copied_campaign_id;
  if (!newMetaCampaignId) {
    return await logFailure(input, source, "Meta /copies returned no copied_campaign_id");
  }

  // 5. Always rename via follow-up so we don't depend on Meta's
  //    rename_options format (which is brittle across Graph versions).
  //    Default suffix matches Meta Ads Manager's default.
  const desiredName = input.newName ?? `${source.name} - Copy`;
  const followUps: Record<string, unknown> = { name: desiredName };
  if (resolvedDailyBudget !== undefined) {
    followUps.daily_budget = String(thbToMinorUnits(resolvedDailyBudget));
  }
  if (resolvedLifetimeBudget !== undefined) {
    followUps.lifetime_budget = String(thbToMinorUnits(resolvedLifetimeBudget));
  }
  let followUpError: string | null = null;
  if (Object.keys(followUps).length > 0) {
    try {
      await graphFetch<{ success: boolean }>(`/${newMetaCampaignId}`, {
        method: "POST",
        accessToken,
        body: followUps,
      });
    } catch (err) {
      followUpError = `Copy succeeded but follow-up failed: ${(err as Error).message}`;
    }
  }

  // 6. Fetch the new campaign's full state. Some campaign types don't
  //    have `end_time` queryable so we ask for the bare minimum first,
  //    then enrich. If even the minimal fetch fails, fall back to a
  //    skeleton row — next dashboard sync will fill in the rest.
  let detail: MetaCampaignDetail;
  try {
    detail = await graphFetch<MetaCampaignDetail>(`/${newMetaCampaignId}`, {
      accessToken,
      searchParams: {
        fields:
          "id,name,effective_status,configured_status,daily_budget,lifetime_budget,objective",
      },
    });
  } catch (err) {
    // Fall back: minimal id+name+status — we know the copy succeeded.
    try {
      detail = await graphFetch<MetaCampaignDetail>(`/${newMetaCampaignId}`, {
        accessToken,
        searchParams: { fields: "id,name,effective_status" },
      });
    } catch (fallback) {
      // Truly can't read it back — leave a skeleton row and let the
      // next dashboard sync populate. Don't fail the whole operation.
      detail = {
        id: newMetaCampaignId,
        name: input.newName ?? `${source.name} - Copy`,
        effective_status: initialStatus,
      };
      console.warn(
        `[duplicate] copy ${newMetaCampaignId} created but readback failed: ${(err as Error).message} / ${(fallback as Error).message}`,
      );
    }
  }
  // Try to read end_time separately — non-fatal if missing.
  try {
    const withEnd = await graphFetch<{ end_time?: string }>(`/${newMetaCampaignId}`, {
      accessToken,
      searchParams: { fields: "end_time" },
    });
    if (withEnd.end_time) detail.end_time = withEnd.end_time;
  } catch {
    // Some campaign types don't expose end_time. That's OK.
  }

  // 7. Upsert MetaCampaign row for the new campaign
  const dailyMinor = detail.daily_budget && detail.daily_budget !== "0" ? Number(detail.daily_budget) : null;
  const lifetimeMinor = detail.lifetime_budget && detail.lifetime_budget !== "0" ? Number(detail.lifetime_budget) : null;
  const newCampaign = await prisma.metaCampaign.upsert({
    where: {
      metaConnectionId_metaCampaignId: {
        metaConnectionId: source.metaConnectionId,
        metaCampaignId: newMetaCampaignId,
      },
    },
    update: {
      name: detail.name,
      metaObjective: detail.objective ?? null,
      effectiveStatus: detail.effective_status,
      configuredStatus: detail.configured_status ?? null,
      dailyBudget: dailyMinor,
      lifetimeBudget: lifetimeMinor,
      endTime: detail.end_time ? new Date(detail.end_time) : null,
      metaAccountId: source.metaAccountId,
      lastFetchedAt: new Date(),
    },
    create: {
      metaConnectionId: source.metaConnectionId,
      metaCampaignId: newMetaCampaignId,
      metaAccountId: source.metaAccountId,
      name: detail.name,
      metaObjective: detail.objective ?? null,
      effectiveStatus: detail.effective_status,
      configuredStatus: detail.configured_status ?? null,
      dailyBudget: dailyMinor,
      lifetimeBudget: lifetimeMinor,
      endTime: detail.end_time ? new Date(detail.end_time) : null,
    },
    select: { id: true, name: true, effectiveStatus: true },
  });

  // 8. Audit log — DUPLICATE row attached to the SOURCE campaign so the
  //    history view can find both ends of the operation.
  const log = await prisma.campaignActionLog.create({
    data: {
      tenantId: input.tenantId,
      campaignId: source.id,
      metaCampaignId: source.metaCampaignId,
      userId: input.userId,
      action: "DUPLICATE",
      beforeStatus: null,
      afterStatus: detail.effective_status,
      beforeValue: { sourceName: source.name } as never,
      afterValue: {
        newCampaignInternalId: newCampaign.id,
        newMetaCampaignId,
        newName: detail.name,
        dailyBudget: dailyMinor,
        lifetimeBudget: lifetimeMinor,
        initialStatus,
        followUpError,
      } as never,
      result: "SUCCESS",
      errorMessage: followUpError,
    },
  });

  // 9. Invalidate dashboard cache
  await invalidateDashboardCache(input.tenantId).catch(() => {});

  return {
    ok: true,
    newCampaignInternalId: newCampaign.id,
    newMetaCampaignId,
    name: detail.name,
    status: detail.effective_status,
    logId: log.id,
  };
}

async function logFailure(
  input: DuplicateInput,
  source: { id: string; metaCampaignId: string },
  error: string,
): Promise<DuplicateResult> {
  const log = await prisma.campaignActionLog.create({
    data: {
      tenantId: input.tenantId,
      campaignId: source.id,
      metaCampaignId: source.metaCampaignId,
      userId: input.userId,
      action: "DUPLICATE",
      result: "FAILED",
      errorMessage: error,
    },
  });
  return { ok: false, error, logId: log.id };
}
