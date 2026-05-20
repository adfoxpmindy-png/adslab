import EventLogPage from "../../events/page";

export default function AutomationEventsPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <EventLogPage params={props.params} />;
}
