import Link from "next/link";
import { Sparkles, FileText } from "lucide-react";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { GenerateReportButton } from "@/components/tenant/generate-report-button";

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  COMPLETED: { label: "เสร็จแล้ว", tone: "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300" },
  GENERATING: { label: "กำลังสร้าง...", tone: "text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300" },
  FAILED: { label: "ล้มเหลว", tone: "text-destructive bg-destructive/10" },
};

export default async function ReportsListPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant, role } = await requireTenantMember(tenantSlug);

  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: { id: true, status: true },
  });
  const canGenerate = role === "OWNER" || role === "MEDIA_BUYER";
  const isConnected = connection !== null && connection.status === "ACTIVE";

  const reports = await prisma.dailyReport.findMany({
    where: { tenantId: tenant.id },
    orderBy: { reportDate: "desc" },
    take: 30,
    select: {
      id: true,
      reportDate: true,
      status: true,
      contentMd: true,
      generatedAt: true,
      deliveredAt: true,
      estimatedCostUsd: true,
    },
  });

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary/10">
            <Sparkles className="size-5 text-primary" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">AI Reports</p>
            <h1 className="text-2xl font-semibold tracking-tight">รายงานประจำวัน</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              AI สรุปผลของวันก่อนหน้าทุกเช้า 9 โมง (เวลาประเทศไทย)
            </p>
          </div>
        </div>
        {canGenerate && isConnected && (
          <GenerateReportButton tenantSlug={tenantSlug} />
        )}
      </header>

      {!isConnected && (
        <Card className="flex flex-col items-center justify-center gap-3 border-dashed py-12 text-center">
          <p className="text-sm font-medium">ต้องเชื่อมต่อ Meta ก่อนใช้งาน AI Reports</p>
          <Link
            href={`/t/${tenantSlug}/settings/integrations`}
            className={cn(buttonVariants({ size: "sm" }), "gap-2")}
          >
            ไปที่ Settings
          </Link>
        </Card>
      )}

      {isConnected && reports.length === 0 && (
        <Card className="flex flex-col items-center justify-center gap-3 border-dashed py-16 text-center">
          <FileText className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium">ยังไม่มีรายงาน</p>
          <p className="text-xs text-muted-foreground">
            คลิก &quot;สร้างรายงานเดี๋ยวนี้&quot; เพื่อให้ AI สรุปข้อมูลของเมื่อวานให้คุณ
          </p>
        </Card>
      )}

      {isConnected && reports.length > 0 && (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {reports.map((r) => {
              const status = STATUS_LABEL[r.status] ?? STATUS_LABEL.GENERATING;
              const preview = extractFirstSentence(r.contentMd ?? "");
              const dateLabel = r.reportDate.toISOString().slice(0, 10);
              return (
                <li key={r.id}>
                  <Link
                    href={`/t/${tenantSlug}/reports/${r.id}`}
                    className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium tabular-nums">{dateLabel}</span>
                        <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide", status.tone)}>
                          {status.label}
                        </span>
                        {r.deliveredAt && (
                          <span className="text-[11px] text-muted-foreground">ส่งอีเมลแล้ว</span>
                        )}
                      </div>
                      {preview && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{preview}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5 text-[11px] text-muted-foreground">
                      <span>{new Date(r.generatedAt).toLocaleString("th-TH")}</span>
                      {r.estimatedCostUsd > 0 && (
                        <span>${r.estimatedCostUsd.toFixed(4)}</span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

function extractFirstSentence(md: string): string {
  if (!md) return "";
  // Strip markdown chars + take first non-heading line
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    if (line.startsWith("-")) return line.replace(/^-\s*/, "");
    return line.replace(/\*\*/g, "");
  }
  return "";
}
