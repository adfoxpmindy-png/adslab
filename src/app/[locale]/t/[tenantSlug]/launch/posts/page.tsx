import PostsPage from "../../posts/page";

export default function InventoryLabPostsPage(props: {
  params: Promise<{ tenantSlug: string }>;
}) {
  return <PostsPage params={props.params} />;
}
