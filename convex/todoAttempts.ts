import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { requireAuthenticated } from "./authHelpers";
import { internalQuery, query } from "./_generated/server";
import { todoAttemptDocValidator } from "./lib/todoValidators";

const MAX_TODOS_PER_LATEST_ATTEMPT_QUERY = 100;

function projectAttempt(attempt: Doc<"todoAttempts">) {
  return {
    _id: attempt._id,
    _creationTime: attempt._creationTime,
    todoId: attempt.todoId,
    harnessId: attempt.harnessId,
    runConfiguration: attempt.runConfiguration,
    sandboxId: attempt.sandboxId,
    harnessRunId: attempt.harnessRunId,
    harnessUrl: attempt.harnessUrl,
    streamState: attempt.streamState,
    startedAt: attempt.startedAt,
    terminalAt: attempt.terminalAt,
    terminalReason: attempt.terminalReason,
    isActive: attempt.isActive,
  };
}

export const getById = internalQuery({
  args: { attemptId: v.id("todoAttempts") },
  returns: v.union(todoAttemptDocValidator, v.null()),
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get("todoAttempts", args.attemptId);
    if (!attempt) return null;
    return projectAttempt(attempt);
  },
});

export const getLatestForTodo = query({
  args: { todoId: v.id("todos") },
  returns: v.union(todoAttemptDocValidator, v.null()),
  handler: async (ctx, args) => {
    await requireAuthenticated(ctx);
    const attempt = await ctx.db
      .query("todoAttempts")
      .withIndex("by_todoId", (q) => q.eq("todoId", args.todoId))
      .order("desc")
      .first();
    return attempt ? projectAttempt(attempt) : null;
  },
});

export const listLatestForTodos = query({
  args: { todoIds: v.array(v.id("todos")) },
  returns: v.array(todoAttemptDocValidator),
  handler: async (ctx, args) => {
    await requireAuthenticated(ctx);
    if (args.todoIds.length > MAX_TODOS_PER_LATEST_ATTEMPT_QUERY) {
      throw new ConvexError({
        code: "TOO_MANY_TODOS",
        message: `Request at most ${MAX_TODOS_PER_LATEST_ATTEMPT_QUERY} Todo Tasks at a time.`,
      });
    }
    const attempts = await Promise.all(
      args.todoIds.map(async (todoId) =>
        await ctx.db
          .query("todoAttempts")
          .withIndex("by_todoId", (q) => q.eq("todoId", todoId))
          .order("desc")
          .first(),
      ),
    );
    return attempts
      .filter((attempt) => attempt !== null)
      .map(projectAttempt);
  },
});
