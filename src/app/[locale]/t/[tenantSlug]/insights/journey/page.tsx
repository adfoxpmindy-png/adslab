import JourneyPage from "../../journey/page";

export default function InsightsLabJourneyPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <JourneyPage params={props.params} />;
}
