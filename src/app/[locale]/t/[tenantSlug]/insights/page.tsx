import DashboardPage from "../dashboard/page";

export default function InsightsLabOverviewPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <DashboardPage params={props.params} />;
}
