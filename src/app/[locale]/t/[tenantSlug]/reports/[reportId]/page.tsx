import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Mail } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/card";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { renderMarkdown } from "@/lib/markdown";
import { ReportActionsPanel } from "@/components/tenant/report-actions-panel";
import { FrostVisualHero } from "@/components/reports/frost-visual-hero";
import type { ValidatedSuggestion } from "@/lib/reports/extract-actions";
import { enrichReportSuggestions, isFreshReport } from "@/lib/reports/enrich-suggestions";

const LOCALE_MAP: Record<string, string> = {
  th: "th-TH",
  en: "en-US",
  lo: "lo-LA",
};

export default async function ReportViewerPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; reportId: string }>;
}) {
  const { tenantSlug, reportId } = await params;
  const { tenant, role } = await requireTenantMember(tenantSlug);
  const t = await getTranslations("pages.reports.viewer");
  const locale = await getLocale();
  const intlLocale = LOCALE_MAP[locale] ?? "en-US";

  const STATUS_LABEL: Record<string, string> = {
    COMPLETED: t("statusCompleted"),
    GENERATING: t("statusGenerating"),
    FAILED: t("statusFailed"),
  };

  const report = await prisma.dailyReport.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      tenantId: true,
      reportDate: true,
      status: true,
      contentMd: true,
      suggestedActions: true,
      generatedAt: true,
      deliveredAt: true,
      generationError: true,
      promptTokens: true,
      completionTokens: true,
      estimatedCostUsd: true,
    },
  });
  if (!report || report.tenantId !== tenant.id) notFound();

  const dateLabel = report.reportDate.toISOString().slice(0, 10);
  const canApply = role === "OWNER" || role === "MEDIA_BUYER";
  const suggestions = (report.suggestedActions as ValidatedSuggestion[] | null) ?? [];
  const enrichedSuggestions =
    suggestions.length > 0
      ? await enrichReportSuggestions({
          tenantId: tenant.id,
          reportDate: report.reportDate,
          suggestions,
          includeConfidence: isFreshReport(report.generatedAt),
        })
      : [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
      <Link
        href={`/t/${tenantSlug}/reports`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        <ChevronLeft className="size-4" />
        {t("backToList")}
      </Link>

      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">AI Daily Report</p>
        <h1 className="text-3xl font-semibold tracking-tight">{dateLabel}</h1>
        <p className="text-sm text-muted-foreground">
          {t("statusLabel", { status: STATUS_LABEL[report.status] ?? report.status })}
          {report.deliveredAt && (
            <>
              {" · "}
              <span className="inline-flex items-center gap-1">
                <Mail className="size-3.5" />
                {t("emailedAt", { when: new Date(report.deliveredAt).toLocaleString(intlLocale) })}
              </span>
            </>
          )}
        </p>
      </header>

      {report.status === "FAILED" && (
        <Card className="border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">{t("generationFailed")}</p>
          {report.generationError && (
            <p className="mt-1 text-xs text-destructive/80 font-mono">{report.generationError}</p>
          )}
        </Card>
      )}

      {report.status === "COMPLETED" && (
        <FrostVisualHero tenantId={tenant.id} reportDate={report.reportDate} />
      )}

      {report.status === "COMPLETED" && enrichedSuggestions.length > 0 && (
        <ReportActionsPanel
          tenantSlug={tenantSlug}
          reportId={report.id}
          suggestions={enrichedSuggestions}
          canApply={canApply}
        />
      )}

      {report.status === "COMPLETED" && report.contentMd && (
        <Card className="p-8">
          <article
            className="prose-sm"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(report.contentMd) }}
          />
        </Card>
      )}

      {report.status === "GENERATING" && (
        <Card className="flex items-center gap-3 p-6">
          <div className="size-3 animate-pulse rounded-full bg-primary" />
          <p className="text-sm">{t("generatingMessage")}</p>
        </Card>
      )}

      <footer className="text-xs text-muted-foreground">
        Tokens: prompt {report.promptTokens.toLocaleString()} · completion {report.completionTokens.toLocaleString()}
        {report.estimatedCostUsd > 0 && <> · est. cost ${report.estimatedCostUsd.toFixed(4)}</>}
      </footer>
    </div>
  );
}
