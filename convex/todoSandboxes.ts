import { v } from "convex/values";
import {
  internalQuery,
  query,
} from "./_generated/server";
import { requireAuthenticated } from "./authHelpers";
import { sandboxRowValidator } from "./lib/todoValidators";

export const getSandboxByTodoId = internalQuery({
  args: { todoId: v.id("todos") },
  returns: v.union(sandboxRowValidator, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("todoSandboxes")
      .withIndex("by_todoId", (q) => q.eq("todoId", args.todoId))
      .unique();
    if (!row) {
      return null;
    }
    return {
      _id: row._id,
      _creationTime: row._creationTime,
      todoId: row.todoId,
      sandboxId: row.sandboxId,
      runConfiguration: row.runConfiguration,
      opencode: row.opencode,
    };
  },
});

export const getSandboxForTodo = query({
  args: { todoId: v.id("todos") },
  returns: v.union(sandboxRowValidator, v.null()),
  handler: async (ctx, args) => {
    await requireAuthenticated(ctx);
    const row = await ctx.db
      .query("todoSandboxes")
      .withIndex("by_todoId", (q) => q.eq("todoId", args.todoId))
      .unique();
    if (!row) {
      return null;
    }
    return {
      _id: row._id,
      _creationTime: row._creationTime,
      todoId: row.todoId,
      sandboxId: row.sandboxId,
      runConfiguration: row.runConfiguration,
      opencode: row.opencode,
    };
  },
});

