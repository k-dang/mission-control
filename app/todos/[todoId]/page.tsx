import type { Id } from "@/convex/_generated/dataModel";
import { TodoDetailPageClient } from "./TodoDetailPageClient";

export default async function TodoDetailPage(
  props: PageProps<"/todos/[todoId]">,
) {
  const { todoId } = await props.params;

  return <TodoDetailPageClient todoId={todoId as Id<"todos">} />;
}
