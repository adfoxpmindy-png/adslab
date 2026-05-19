import AudiencesPage from "../../audiences/page";

export default function InventoryLabAudiencesPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <AudiencesPage params={props.params} />;
}
