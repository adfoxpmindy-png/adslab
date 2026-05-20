import CompetitorsPage from "../../competitors/page";

export default function InsightsCompetitorsPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <CompetitorsPage params={props.params} />;
}
