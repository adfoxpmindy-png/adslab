import NewCampaignPage from "../../campaigns/new/page";

export default function LaunchLabNewCampaignPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <NewCampaignPage params={props.params} />;
}
