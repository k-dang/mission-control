import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { requireAuthenticated } from "./authHelpers";

const sandboxRowValidator = v.object({
  _id: v.id("todoSandboxes"),
  _creationTime: v.number(),
  todoId: v.id("todos"),
  sandboxId: v.string(),
  opencodeUrl: v.optional(v.string()),
});

export const getSandboxByTodoId = internalQuery({
  args: { todoId: v.id("todos") },
  returns: v.union(sandboxRowValidator, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("todoSandboxes")
      .withIndex("by_todoId", (q) => q.eq("todoId", args.todoId))
      .unique();
    return row ?? null;
  },
});

export const getForTodo = query({
  args: { todoId: v.id("todos") },
  returns: v.union(sandboxRowValidator, v.null()),
  handler: async (ctx, args) => {
    await requireAuthenticated(ctx);
    const row = await ctx.db
      .query("todoSandboxes")
      .withIndex("by_todoId", (q) => q.eq("todoId", args.todoId))
      .unique();
    return row ?? null;
  },
});

export const clearSandboxResult = internalMutation({
  args: {
    todoId: v.id("todos"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("todoSandboxes")
      .withIndex("by_todoId", (q) => q.eq("todoId", args.todoId))
      .unique();
    if (row) {
      await ctx.db.delete("todoSandboxes", row._id);
    }
    return null;
  },
});

export const saveSandboxResult = internalMutation({
  args: {
    todoId: v.id("todos"),
    sandboxId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("todoSandboxes")
      .withIndex("by_todoId", (q) => q.eq("todoId", args.todoId))
      .unique();
    if (existing) {
      await ctx.db.patch("todoSandboxes", existing._id, {
        sandboxId: args.sandboxId,
        opencodeUrl: undefined,
      });
    } else {
      await ctx.db.insert("todoSandboxes", {
        todoId: args.todoId,
        sandboxId: args.sandboxId,
      });
    }
    return null;
  },
});

export const setOpencodeUrl = internalMutation({
  args: {
    todoId: v.id("todos"),
    opencodeUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("todoSandboxes")
      .withIndex("by_todoId", (q) => q.eq("todoId", args.todoId))
      .unique();
    if (!existing) {
      throw new Error(
        `No sandbox row for todo ${args.todoId}; cannot save OpenCode URL`,
      );
    }
    await ctx.db.patch("todoSandboxes", existing._id, {
      opencodeUrl: args.opencodeUrl,
    });
    return null;
  },
});

export const markFailed = internalMutation({
  args: {
    todoId: v.id("todos"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("todos", args.todoId, {
      status: "FAILED",
    });
    return null;
  },
});

export const savePrUrl = internalMutation({
  args: {
    todoId: v.id("todos"),
    prUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("todos", args.todoId, {
      prUrl: args.prUrl,
    });
    return null;
  },
});
