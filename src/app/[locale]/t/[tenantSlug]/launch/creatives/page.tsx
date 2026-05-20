import CreativesPage from "../../creatives/page";

export default function LaunchCreativesPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <CreativesPage params={props.params} />;
}
