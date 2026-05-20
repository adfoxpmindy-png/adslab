import CompetitorsPage from "../../competitors/page";

export default function InsightsLabCompetitorsPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <CompetitorsPage params={props.params} />;
}
