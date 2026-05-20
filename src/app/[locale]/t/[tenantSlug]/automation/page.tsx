import RulesPage from "../rules/page";

export default function AutomationRulesPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <RulesPage params={props.params} />;
}
