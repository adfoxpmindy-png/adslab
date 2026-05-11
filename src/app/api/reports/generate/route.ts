import { NextResponse } from "next/server";

import { requireTenantMember } from "@/lib/auth/tenant";
import { generateDailyReport } from "@/lib/reports/daily-report";
import { requireSession } from "@/lib/auth/session";

/**
 * POST /api/reports/generate?tenantSlug=<slug>&date=<YYYY-MM-DD>&email=<bool>
 *
 * Manually trigger a daily-report generation. OWNER + MEDIA_BUYER only —
 * VIEWER can read existing reports but cannot kick off new AI calls (burns
 * OpenRouter quota).
 *
 * If `date` is omitted the report covers "yesterday" (Bangkok local).
 * If `email=true`, the report is also emailed to the tenant OWNER after
 * generation; default is dashboard-only.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug query param required" }, { status: 400 });
  }

  const date = url.searchParams.get("date") ?? undefined;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);

  const shouldEmail = url.searchParams.get("email") === "true";

  const result = await generateDailyReport({
    tenantId: tenant.id,
    reportDate: date,
    generatedBy: session.userId,
    sendEmail: shouldEmail,
  });

  if (result.status === "failed") {
    return NextResponse.json({ error: result.error, reportId: result.reportId }, { status: 500 });
  }

  return NextResponse.json(result);
}
