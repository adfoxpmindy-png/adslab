/**
 * Dispatches rule actions when conditions match. Each handler is
 * idempotent — running it against an already-paused adset returns
 * `no_change_needed`, not an error.
 */
import { graphFetch } from "@/lib/meta/graph-api";
import { sendEmail } from "@/lib/email/send";

import type { ActionResult, RuleAction } from "./types";

export type ActionContext = {
  tenantId: string;
  ruleId: string;
  ruleName: string;
  targetId: string;
  /** Brief description of why the rule matched (e.g. "CPV ฿6.30 > ฿5.00 over 2h"). */
  reason: string;
  accessToken: string;
};

/**
 * Tenant OWNER emails — populated by runner before dispatch. Passed
 * separately so the dispatcher itself stays I/O-light.
 */
export type NotifyTargets = {
  ownerEmails: string[];
};

export async function dispatchAction(
  action: RuleAction,
  ctx: ActionContext,
  notify: NotifyTargets,
): Promise<{ result: ActionResult; message?: string }> {
  switch (action) {
    case "pause_adset":
      return pauseEntity(ctx.targetId, ctx.accessToken, "adset");
    case "pause_campaign":
      return pauseEntity(ctx.targetId, ctx.accessToken, "campaign");
    case "notify_email":
      return notifyEmail(ctx, notify);
    case "notify_in_app":
      // In-app notification: we just record the RuleRun row (caller does
      // that). Mark as "fired" so cooldown applies. Future: write a Notice
      // row that the bell icon in topbar can render.
      return { result: "fired" };
  }
}

async function pauseEntity(
  metaId: string,
  accessToken: string,
  level: "adset" | "campaign",
): Promise<{ result: ActionResult; message?: string }> {
  try {
    // Read current status first to skip the write if already paused.
    const current = await graphFetch<{ status: string; effective_status: string }>(
      `/${metaId}`,
      { accessToken, searchParams: { fields: "status,effective_status" } },
    );
    if (current.status === "PAUSED" || current.effective_status === "PAUSED") {
      return { result: "no_change_needed", message: `${level} already paused` };
    }
    await graphFetch(`/${metaId}`, {
      method: "POST",
      accessToken,
      body: { status: "PAUSED" },
    });
    return { result: "fired" };
  } catch (err) {
    return { result: "error", message: (err as Error).message };
  }
}

async function notifyEmail(
  ctx: ActionContext,
  notify: NotifyTargets,
): Promise<{ result: ActionResult; message?: string }> {
  if (notify.ownerEmails.length === 0) {
    return { result: "error", message: "no OWNER emails to notify" };
  }
  try {
    await sendEmail({
      to: notify.ownerEmails,
      subject: `[AdsLab] Rule "${ctx.ruleName}" triggered`,
      html: renderEmailBody(ctx),
    });
    return { result: "fired" };
  } catch (err) {
    return { result: "error", message: (err as Error).message };
  }
}

function renderEmailBody(ctx: ActionContext): string {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 600px; padding: 20px;">
      <h2 style="color: #6d28d9; margin: 0 0 12px;">AdsLab Rule Triggered</h2>
      <p style="font-size: 14px; color: #555;">
        Rule <strong>${escapeHtml(ctx.ruleName)}</strong> matched and would have
        fired its notify action.
      </p>
      <div style="background: #f5f3ff; border-left: 4px solid #8b5cf6; padding: 12px 16px; margin: 16px 0; font-size: 13px;">
        ${escapeHtml(ctx.reason)}
      </div>
      <p style="font-size: 13px; color: #666;">
        Target: <code>${escapeHtml(ctx.targetId)}</code>
      </p>
      <p style="font-size: 12px; color: #999; margin-top: 24px;">
        Open AdsLab to manage this rule:
        <a href="https://ads-lab.xyz/t/demo/rules" style="color: #6d28d9;">View rules</a>
      </p>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
