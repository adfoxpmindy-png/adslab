import NamingRulesPage from "../../goals/naming/page";

export default function AutomationLabNamingPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <NamingRulesPage params={props.params} />;
}
