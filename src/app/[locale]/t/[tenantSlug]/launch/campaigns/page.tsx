import CampaignsPage from "../../campaigns/page";

type SearchParams = Record<string, string | string[] | undefined>;

export default function LaunchLabCampaignsPage(props: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  return <CampaignsPage params={props.params} searchParams={props.searchParams} />;
}
