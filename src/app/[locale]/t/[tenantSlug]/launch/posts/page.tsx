import PostsPage from "../../posts/page";

export default function LaunchPostsPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <PostsPage params={props.params} />;
}
