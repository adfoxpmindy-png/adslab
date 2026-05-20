import AICampaignBuilderPage from "../../campaigns/ai-new/page";

export default function LaunchAINewPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <AICampaignBuilderPage params={props.params} />;
}
