import AudiencesPage from "../../audiences/page";

export default function LaunchAudiencesPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <AudiencesPage params={props.params} />;
}
