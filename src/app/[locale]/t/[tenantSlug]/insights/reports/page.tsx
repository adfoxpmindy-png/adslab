import ReportsListPage from "../../reports/page";

type SearchParams = Record<string, string | string[] | undefined>;

export default function InsightsReportsPage(props: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  return <ReportsListPage params={props.params} searchParams={props.searchParams} />;
}
