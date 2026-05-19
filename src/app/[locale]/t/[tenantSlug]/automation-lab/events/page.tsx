import EventLogPage from "../../events/page";

export default function AutomationLabEventsPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <EventLogPage params={props.params} />;
}
