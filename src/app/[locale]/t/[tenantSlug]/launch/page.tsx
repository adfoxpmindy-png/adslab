import AdsPage from "../ads/page";

type SearchParams = Record<string, string | string[] | undefined>;

export default function LaunchAdsPage(props: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  return <AdsPage params={props.params} searchParams={props.searchParams} />;
}
