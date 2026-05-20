import ReportViewerPage from "../../../reports/[reportId]/page";

export default function InsightsLabReportViewerPage(props: {
  params: Promise<{ tenantSlug: string; reportId: string }>;
}) {
  return <ReportViewerPage params={props.params} />;
}
