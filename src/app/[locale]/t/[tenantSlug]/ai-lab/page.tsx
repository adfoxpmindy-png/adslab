import AIPage from "../ai/page";

export default function AILabChatPage(props: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ c?: string; q?: string }>;
}) {
  return <AIPage params={props.params} searchParams={props.searchParams} />;
}
