import NamingRulesPage from "../../goals/naming/page";

export default function AutomationNamingPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <NamingRulesPage params={props.params} />;
}
