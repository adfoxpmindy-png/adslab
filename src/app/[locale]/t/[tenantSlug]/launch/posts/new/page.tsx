import NewPostPage from "../../../posts/new/page";

export default function LaunchNewPostPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <NewPostPage params={props.params} />;
}
