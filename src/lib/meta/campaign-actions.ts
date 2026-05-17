import { prisma } from "@/lib/prisma";
import { getFreshAccessToken } from "./client";
import { graphFetch } from "./graph-api";
import { invalidateDashboardCache } from "./dashboard-service";

/**
 * Quick actions on existing Meta campaigns. v2 adds SET_BUDGET and
 * SET_END_DATE alongside the v1 PAUSE/RESUME — covers ~90% of the
 * actions a media buyer takes in Ads Manager during a workday.
 *
 * Every action goes through `performCampaignAction()`:
 *   1. Resolve the campaign + verify tenant ownership
 *   2. Action-specific validation (e.g. CBO check for SET_BUDGET)
 *   3. Call Meta
 *   4. Update our cached MetaCampaign row
 *   5. Log to CampaignActionLog (success OR failure — always)
 *   6. Invalidate dashboard cache so the next dashboard fetch sees it
 */

// THB → Meta minor units (×100). Meta also accepts cents-of-currency
// for non-THB accounts; the multiplier is currency-dependent. We only
// support THB for now (matches founder's accounts).
const MINOR_UNITS_PER_THB = 100;

// Validation bounds. Founders can request override if they really need
// to push more than ฿1M/day, but it's almost always a typo.
export const MIN_BUDGET_THB = 20;
export const MAX_BUDGET_THB = 1_000_000;

/** True if budget can be edited at the campaign level (CBO). */
export function isCboCampaign(c: {
  dailyBudget: number | null;
  lifetimeBudget: number | null;
}): boolean {
  return c.dailyBudget !== null || c.lifetimeBudget !== null;
}

/** Convert THB → Meta minor units. Throws if amount is invalid. */
export function thbToMinorUnits(thb: number): number {
  if (!Number.isFinite(thb) || thb < 0) {
    throw new Error("Budget must be a non-negative number");
  }
  return Math.round(thb * MINOR_UNITS_PER_THB);
}

export type ActionInput =
  | { action: "PAUSE" }
  | { action: "RESUME" }
  | {
      action: "SET_BUDGET";
      /** New budget in THB. Set exactly one of dailyBudget/lifetimeBudget. */
      dailyBudget?: number;
      lifetimeBudget?: number;
    }
  | { action: "SET_END_DATE"; endTime: Date };

export type ActionType = ActionInput["action"];

const STATUS_FOR_ACTION: Partial<Record<ActionType, "PAUSED" | "ACTIVE">> = {
  PAUSE: "PAUSED",
  RESUME: "ACTIVE",
};

export type PerformActionInput = {
  tenantId: string;
  userId: string;
  campaignId: string; // internal MetaCampaign.id (cuid)
} & ActionInput;

export type PerformActionResult =
  | {
      ok: true;
      campaignId: string;
      action: ActionType;
      beforeStatus?: string | null;
      afterStatus?: string;
      beforeValue?: unknown;
      afterValue?: unknown;
      logId: string;
    }
  | { ok: false; error: string; logId: string | null };

export async function performCampaignAction(
  input: PerformActionInput,
): Promise<PerformActionResult> {
  // 1. Resolve campaign + verify ownership
  const campaign = await prisma.metaCampaign.findFirst({
    where: { id: input.campaignId, connection: { tenantId: input.tenantId } },
    select: {
      id: true,
      metaCampaignId: true,
      effectiveStatus: true,
      configuredStatus: true,
      dailyBudget: true,
      lifetimeBudget: true,
      endTime: true,
      metaConnectionId: true,
    },
  });
  if (!campaign) {
    return { ok: false, error: "Campaign not found", logId: null };
  }

  // 2. Action-specific validation BEFORE calling Meta. Failed validations
  //    are logged as FAILED with no Meta call.
  let metaBody: Record<string, unknown>;
  let beforeValue: Record<string, unknown> | null = null;
  let afterValue: Record<string, unknown> | null = null;
  let beforeStatus: string | null = null;
  let afterStatus: string | null = null;
  let isIdempotentNoop = false;

  if (input.action === "PAUSE" || input.action === "RESUME") {
    beforeStatus = campaign.configuredStatus ?? campaign.effectiveStatus;
    afterStatus = STATUS_FOR_ACTION[input.action]!;
    isIdempotentNoop = campaign.configuredStatus === afterStatus;
    metaBody = { status: afterStatus };
  } else if (input.action === "SET_BUDGET") {
    if (!isCboCampaign(campaign)) {
      return await logFailure(
        input,
        campaign,
        "Budget อยู่ที่ระดับ ad set — แก้ใน Meta Ads Manager",
      );
    }
    const isDaily = input.dailyBudget !== undefined;
    const isLifetime = input.lifetimeBudget !== undefined;
    if (isDaily === isLifetime) {
      return await logFailure(
        input,
        campaign,
        "ต้องระบุอย่างใดอย่างหนึ่ง: dailyBudget หรือ lifetimeBudget",
      );
    }
    // Lock to the model the campaign already uses — Meta rejects swaps.
    if (isDaily && campaign.dailyBudget === null) {
      return await logFailure(
        input,
        campaign,
        "Campaign นี้ใช้ lifetime budget อยู่ — แก้แบบ lifetime แทน",
      );
    }
    if (isLifetime && campaign.lifetimeBudget === null) {
      return await logFailure(
        input,
        campaign,
        "Campaign นี้ใช้ daily budget อยู่ — แก้แบบ daily แทน",
      );
    }
    const thb = (isDaily ? input.dailyBudget : input.lifetimeBudget) as number;
    if (thb < MIN_BUDGET_THB) {
      return await logFailure(
        input,
        campaign,
        `Budget ต่ำกว่าขั้นต่ำ ฿${MIN_BUDGET_THB}`,
      );
    }
    if (thb > MAX_BUDGET_THB) {
      return await logFailure(
        input,
        campaign,
        `Budget เกินเพดาน ฿${MAX_BUDGET_THB.toLocaleString()} — ตรวจสอบว่าใส่ตัวเลขถูกหรือไม่`,
      );
    }
    const minor = thbToMinorUnits(thb);
    beforeValue = {
      dailyBudget: campaign.dailyBudget,
      lifetimeBudget: campaign.lifetimeBudget,
    };
    afterValue = isDaily
      ? { dailyBudget: minor, lifetimeBudget: campaign.lifetimeBudget }
      : { dailyBudget: campaign.dailyBudget, lifetimeBudget: minor };
    metaBody = isDaily
      ? { daily_budget: String(minor) }
      : { lifetime_budget: String(minor) };
    isIdempotentNoop =
      (isDaily && campaign.dailyBudget === minor) ||
      (isLifetime && campaign.lifetimeBudget === minor);
  } else if (input.action === "SET_END_DATE") {
    const now = Date.now();
    // Allow end_time == now (= "end now") but reject anything older —
    // Meta rejects past times anyway.
    if (input.endTime.getTime() < now - 60_000) {
      return await logFailure(input, campaign, "end_time ต้องไม่ใช่อดีต");
    }
    beforeValue = { endTime: campaign.endTime?.toISOString() ?? null };
    afterValue = { endTime: input.endTime.toISOString() };
    // Meta expects ISO 8601; use seconds-precision to match what their
    // API returns and avoid drift on re-sync.
    metaBody = { end_time: input.endTime.toISOString() };
    isIdempotentNoop = campaign.endTime?.getTime() === input.endTime.getTime();
  } else {
    return { ok: false, error: "Unknown action", logId: null };
  }

  // 3. Idempotent no-op: log + return without calling Meta.
  if (isIdempotentNoop) {
    const log = await prisma.campaignActionLog.create({
      data: {
        tenantId: input.tenantId,
        campaignId: campaign.id,
        metaCampaignId: campaign.metaCampaignId,
        userId: input.userId,
        action: input.action,
        beforeStatus,
        afterStatus,
        beforeValue: (beforeValue ?? undefined) as never,
        afterValue: (afterValue ?? undefined) as never,
        result: "SUCCESS",
      },
    });
    return {
      ok: true,
      campaignId: campaign.id,
      action: input.action,
      beforeStatus,
      afterStatus: afterStatus ?? undefined,
      beforeValue,
      afterValue,
      logId: log.id,
    };
  }

  // 4. Fetch fresh token via the parent connection
  const connection = await prisma.metaConnection.findUnique({
    where: { id: campaign.metaConnectionId },
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
  if (!connection) {
    return { ok: false, error: "Meta connection not found", logId: null };
  }
  if (connection.status !== "ACTIVE") {
    return {
      ok: false,
      error: `Meta connection status is ${connection.status} — reconnect first`,
      logId: null,
    };
  }
  const accessToken = await getFreshAccessToken(connection);

  // 5. Call Meta
  let success = false;
  let errorMessage: string | null = null;
  try {
    await graphFetch<{ success: boolean }>(`/${campaign.metaCampaignId}`, {
      method: "POST",
      accessToken,
      body: metaBody,
    });
    success = true;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  // 6. Log success or failure
  const log = await prisma.campaignActionLog.create({
    data: {
      tenantId: input.tenantId,
      campaignId: campaign.id,
      metaCampaignId: campaign.metaCampaignId,
      userId: input.userId,
      action: input.action,
      beforeStatus,
      afterStatus,
      beforeValue: (beforeValue ?? undefined) as never,
      afterValue: (afterValue ?? undefined) as never,
      result: success ? "SUCCESS" : "FAILED",
      errorMessage,
    },
  });

  if (!success) {
    return { ok: false, error: errorMessage ?? "Meta API failed", logId: log.id };
  }

  // 7. Reflect new state in our cache. For PAUSE/RESUME we overwrite
  //    status; for budget/end_time we overwrite the relevant field.
  const updateData: Record<string, unknown> = { lastFetchedAt: new Date() };
  if (input.action === "PAUSE" || input.action === "RESUME") {
    updateData.configuredStatus = afterStatus;
    updateData.effectiveStatus = afterStatus;
  } else if (input.action === "SET_BUDGET" && afterValue) {
    updateData.dailyBudget = (afterValue as { dailyBudget: number | null }).dailyBudget;
    updateData.lifetimeBudget = (afterValue as { lifetimeBudget: number | null }).lifetimeBudget;
  } else if (input.action === "SET_END_DATE" && afterValue) {
    updateData.endTime = new Date((afterValue as { endTime: string }).endTime);
  }
  await prisma.metaCampaign.update({
    where: { id: campaign.id },
    data: updateData,
  });

  // 8. Invalidate dashboard cache so /dashboard + /reports see fresh data.
  await invalidateDashboardCache(input.tenantId).catch(() => {
    // Cache invalidation failures are non-fatal.
  });

  return {
    ok: true,
    campaignId: campaign.id,
    action: input.action,
    beforeStatus,
    afterStatus: afterStatus ?? undefined,
    beforeValue,
    afterValue,
    logId: log.id,
  };
}

/**
 * Helper: log a validation failure (we never called Meta) and return
 * the standard error shape.
 */
async function logFailure(
  input: PerformActionInput,
  campaign: { id: string; metaCampaignId: string },
  error: string,
): Promise<PerformActionResult> {
  const log = await prisma.campaignActionLog.create({
    data: {
      tenantId: input.tenantId,
      campaignId: campaign.id,
      metaCampaignId: campaign.metaCampaignId,
      userId: input.userId,
      action: input.action,
      result: "FAILED",
      errorMessage: error,
    },
  });
  return { ok: false, error, logId: log.id };
}
