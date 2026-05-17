/**
 * Ad-level actions: PAUSE / RESUME only. (Ads don't have their own
 * budget — that lives on the ad set.)
 *
 * Same lightweight pattern as adset-actions.ts. Tenant ownership
 * verified through ad → ad set → campaign → connection.
 */
import { prisma } from "@/lib/prisma";
import { getFreshAccessToken } from "./client";
import { graphFetch } from "./graph-api";
import { invalidateDashboardCache } from "./dashboard-service";

export type AdActionInput = { type: "PAUSE" } | { type: "RESUME" };

export type PerformAdActionInput = {
  tenantId: string;
  userId: string;
  /** Either internal MetaAd.id OR the Meta digit id — caller can pass either. */
  adId: string;
  action: AdActionInput;
};

export type PerformAdActionResult =
  | {
      ok: true;
      adId: string;
      adName: string;
      beforeStatus?: string | null;
      afterStatus: string;
    }
  | { ok: false; error: string };

export async function performAdAction(
  input: PerformAdActionInput,
): Promise<PerformAdActionResult> {
  const ad = await prisma.metaAd.findFirst({
    where: {
      OR: [{ id: input.adId }, { metaAdId: input.adId }],
      adSet: { campaign: { connection: { tenantId: input.tenantId } } },
    },
    select: {
      id: true,
      metaAdId: true,
      name: true,
      effectiveStatus: true,
      configuredStatus: true,
      adSet: {
        select: {
          campaign: {
            select: { metaConnectionId: true },
          },
        },
      },
    },
  });
  if (!ad) {
    return { ok: false, error: `Ad ${input.adId} ไม่พบใน tenant นี้` };
  }

  const afterStatus = input.action.type === "PAUSE" ? "PAUSED" : "ACTIVE";
  const beforeStatus = ad.configuredStatus ?? ad.effectiveStatus;

  const connection = await prisma.metaConnection.findUnique({
    where: { id: ad.adSet.campaign.metaConnectionId },
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
    return {
      ok: false,
      error: `Meta connection not active (${connection?.status ?? "missing"})`,
    };
  }
  const accessToken = await getFreshAccessToken(connection);

  try {
    await graphFetch<{ success: boolean }>(`/${ad.metaAdId}`, {
      method: "POST",
      accessToken,
      body: { status: afterStatus },
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  await prisma.metaAd.update({
    where: { id: ad.id },
    data: { configuredStatus: afterStatus },
  });
  await invalidateDashboardCache(input.tenantId);

  return {
    ok: true,
    adId: ad.metaAdId,
    adName: ad.name,
    beforeStatus,
    afterStatus,
  };
}
