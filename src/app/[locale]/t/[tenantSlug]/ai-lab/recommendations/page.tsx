import AIOptimizePage from "../../ai-optimize/page";

export default function AILabRecommendationsPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <AIOptimizePage params={props.params} />;
}
