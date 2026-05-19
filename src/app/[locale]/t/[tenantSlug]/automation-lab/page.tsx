import RulesPage from "../rules/page";

export default function AutomationLabRulesPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <RulesPage params={props.params} />;
}
