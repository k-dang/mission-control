import type { Metadata } from "next";
import type { Id } from "@/convex/_generated/dataModel";
import { TodoDetailPageClient } from "./TodoDetailPageClient";

export const metadata: Metadata = {
  title: "Task · Mission Control",
  description: "Task detail and live run transmission log.",
};

export default async function TodoDetailPage(props: {
  params: Promise<{ todoId: string }>;
}) {
  const { todoId } = await props.params;

  return <TodoDetailPageClient todoId={todoId as Id<"todos">} />;
}
