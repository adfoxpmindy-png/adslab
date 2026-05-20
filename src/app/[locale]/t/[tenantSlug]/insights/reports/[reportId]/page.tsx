import ReportViewerPage from "../../../reports/[reportId]/page";

export default function InsightsReportViewerPage(props: {
  params: Promise<{ tenantSlug: string; reportId: string }>;
}) {
  return <ReportViewerPage params={props.params} />;
}
