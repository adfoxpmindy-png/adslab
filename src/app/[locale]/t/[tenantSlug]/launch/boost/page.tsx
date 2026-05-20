import BoostPage from "../../boost/page";

export default function LaunchBoostPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <BoostPage params={props.params} />;
}
