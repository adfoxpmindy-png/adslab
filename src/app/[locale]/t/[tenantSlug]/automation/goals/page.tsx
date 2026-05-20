import GoalsPage from "../../goals/page";

export default function AutomationGoalsPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <GoalsPage params={props.params} />;
}
