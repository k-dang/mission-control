import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const clearSandboxResult = internalMutation({
  args: {
    todoId: v.id("todos"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("todos", args.todoId, {
      sandboxId: undefined,
      prUrl: undefined,
    });
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
    await ctx.db.patch("todos", args.todoId, {
      sandboxId: args.sandboxId,
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
