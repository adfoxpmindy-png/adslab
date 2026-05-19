import CampaignHistoryPage from "../../campaigns/history/page";

type SearchParams = Record<string, string | string[] | undefined>;

export default function LaunchLabHistoryPage(props: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  return <CampaignHistoryPage params={props.params} searchParams={props.searchParams} />;
}
