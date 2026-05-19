import CreativesPage from "../../creatives/page";

export default function InventoryLabCreativesPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <CreativesPage params={props.params} />;
}
