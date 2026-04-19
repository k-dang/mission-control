import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const opencodeTerminalStateValidator = v.union(
  v.literal("COMPLETED"),
  v.literal("FAILED"),
  v.literal("CANCELLED"),
);

const todoTerminalStatusValidator = v.union(
  v.literal("COMPLETED"),
  v.literal("FAILED"),
);

export const setTerminalState = internalMutation({
  args: {
    todoId: v.id("todos"),
    streamState: opencodeTerminalStateValidator,
    terminalAt: v.number(),
    terminalReason: v.optional(v.string()),
    todoStatus: todoTerminalStatusValidator,
    prUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sandboxRow = await ctx.db
      .query("todoSandboxes")
      .withIndex("by_todoId", (q) => q.eq("todoId", args.todoId))
      .unique();
    if (!sandboxRow) {
      throw new Error(
        `No sandbox row for todo ${args.todoId}; cannot set OpenCode terminal state`,
      );
    }

    await ctx.db.patch("todoSandboxes", sandboxRow._id, {
      opencode: {
        ...sandboxRow.opencode,
        streamState: args.streamState,
        terminalAt: args.terminalAt,
        terminalReason: args.terminalReason,
        shutdownSafe: true,
      },
    });

    const trimmedPrUrl = args.prUrl?.trim();
    await ctx.db.patch("todos", args.todoId, {
      prUrl: trimmedPrUrl ? trimmedPrUrl : undefined,
      status: args.todoStatus,
    });

    return null;
  },
});
