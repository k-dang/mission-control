import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const saveSandboxResult = internalMutation({
  args: {
    todoId: v.id("todos"),
    sandboxId: v.string(),
    sandboxUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("todos", args.todoId, {
      sandboxId: args.sandboxId,
      sandboxUrl: args.sandboxUrl,
    });
    return null;
  },
});
