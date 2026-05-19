import BoostPage from "../boost/page";

export default function LaunchLabBoostPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <BoostPage params={props.params} />;
}
