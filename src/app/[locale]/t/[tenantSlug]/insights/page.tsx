import DashboardPage from "../dashboard/page";

export default function InsightsOverviewPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <DashboardPage params={props.params} />;
}
