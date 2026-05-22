import { v } from "convex/values";
import {
  internalQuery,
  query,
} from "./_generated/server";
import { requireAuthenticated } from "./authHelpers";

const opencodeStreamStateValidator = v.union(
  v.literal("IDLE"),
  v.literal("STARTED"),
  v.literal("COMPLETED"),
  v.literal("FAILED"),
  v.literal("CANCELLED"),
);

const opencodeStateValidator = v.object({
  url: v.optional(v.string()),
  sessionId: v.optional(v.string()),
  streamState: opencodeStreamStateValidator,
  startedAt: v.optional(v.number()),
  terminalAt: v.optional(v.number()),
  terminalReason: v.optional(v.string()),
  shutdownSafe: v.boolean(),
});

const sandboxRowValidator = v.object({
  _id: v.id("todoSandboxes"),
  _creationTime: v.number(),
  todoId: v.id("todos"),
  sandboxId: v.string(),
  opencode: opencodeStateValidator,
});

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
      opencode: row.opencode,
    };
  },
});

