import JourneyPage from "../../journey/page";

export default function InsightsJourneyPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <JourneyPage params={props.params} />;
}
