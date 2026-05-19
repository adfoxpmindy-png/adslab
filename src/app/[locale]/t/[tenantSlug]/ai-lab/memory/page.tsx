import MemoryPage from "../../ai/memory/page";

export default function AILabMemoryPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <MemoryPage params={props.params} />;
}
