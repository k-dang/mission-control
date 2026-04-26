import { v } from "convex/values";
import { requireAuthenticated } from "./authHelpers";
import type { Id } from "./_generated/dataModel";
import { type MutationCtx, query } from "./_generated/server";

const countDocValidator = v.object({
  _id: v.id("opencodeToolCallCounts"),
  _creationTime: v.number(),
  todoId: v.id("todos"),
  opencodeSessionId: v.string(),
  count: v.number(),
  updatedAt: v.number(),
});

export async function incrementToolCallCount(
  ctx: MutationCtx,
  args: {
    todoId: Id<"todos">;
    opencodeSessionId: string;
  },
) {
  const existing = await ctx.db
    .query("opencodeToolCallCounts")
    .withIndex("by_todoId_and_opencodeSessionId", (q) =>
      q
        .eq("todoId", args.todoId)
        .eq("opencodeSessionId", args.opencodeSessionId),
    )
    .unique();
  const updatedAt = Date.now();

  if (existing) {
    await ctx.db.patch(existing._id, {
      count: existing.count + 1,
      updatedAt,
    });
    return;
  }

  await ctx.db.insert("opencodeToolCallCounts", {
    todoId: args.todoId,
    opencodeSessionId: args.opencodeSessionId,
    count: 1,
    updatedAt,
  });
}

export const getForTodo = query({
  args: { todoId: v.id("todos") },
  returns: v.union(countDocValidator, v.null()),
  handler: async (ctx, args) => {
    await requireAuthenticated(ctx);

    return await ctx.db
      .query("opencodeToolCallCounts")
      .withIndex("by_todoId", (q) => q.eq("todoId", args.todoId))
      .order("desc")
      .first();
  },
});
