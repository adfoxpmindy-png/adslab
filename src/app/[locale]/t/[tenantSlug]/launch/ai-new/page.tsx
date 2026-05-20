import AICampaignBuilderPage from "../../campaigns/ai-new/page";

export default function LaunchLabAINewPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <AICampaignBuilderPage params={props.params} />;
}
