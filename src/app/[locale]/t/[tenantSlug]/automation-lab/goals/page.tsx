import GoalsPage from "../../goals/page";

export default function AutomationLabGoalsPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <GoalsPage params={props.params} />;
}
