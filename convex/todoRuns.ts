import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { requireAuthenticated } from "./authHelpers";
import { parseRunConfiguration } from "./lib/runConfiguration";
import {
  attemptTerminalStateValidator,
  runConfigurationValidator,
  terminalTodoStatusValidator,
} from "./lib/todoValidators";

const orchestrationValidator = v.union(
  v.literal("scheduled"),
  v.literal("alreadyStarted"),
  v.literal("missingGithubUrl"),
);

const startResultValidator = v.object({
  todoId: v.id("todos"),
  attemptId: v.id("todoAttempts"),
  status: v.literal("INPROGRESS"),
  orchestration: orchestrationValidator,
});
const DELETE_BATCH_SIZE = 100;

async function getActiveAttempt(
  ctx: MutationCtx,
  todo: { _id: Id<"todos">; activeAttemptId?: Id<"todoAttempts"> },
) {
  if (!todo.activeAttemptId) return null;
  const attempt = await ctx.db.get("todoAttempts", todo.activeAttemptId);
  if (!attempt || attempt.todoId !== todo._id) {
    throw new ConvexError({
      code: "INVALID_ACTIVE_ATTEMPT",
      message: "Todo Task points to an invalid active Attempt.",
    });
  }
  return attempt;
}

async function getAttemptInActiveSlot(
  ctx: MutationCtx,
  attemptId: Id<"todoAttempts">,
) {
  const attempt = await ctx.db.get("todoAttempts", attemptId);
  if (!attempt) return null;
  const todo = await ctx.db.get("todos", attempt.todoId);
  if (!todo || todo.deleting || todo.activeAttemptId !== attempt._id) return null;
  return { attempt, todo };
}

export const start = mutation({
  args: {
    todoId: v.id("todos"),
    runConfiguration: runConfigurationValidator,
  },
  returns: startResultValidator,
  handler: async (ctx, args) => {
    await requireAuthenticated(ctx);

    const runConfiguration = parseRunConfiguration(args.runConfiguration);
    if (!runConfiguration.ok) {
      throw new ConvexError({
        code: "UNSUPPORTED_RUN_CONFIGURATION",
        message: runConfiguration.error,
      });
    }

    const todo = await ctx.db.get("todos", args.todoId);
    if (!todo) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Todo not found" });
    }
    if (todo.deleting) {
      throw new ConvexError({
        code: "TODO_DELETING",
        message: "Todo is being deleted.",
      });
    }

    const activeAttempt = await getActiveAttempt(ctx, todo);
    if (activeAttempt) {
      if (todo.status !== "INPROGRESS") {
        await ctx.db.patch("todos", args.todoId, { status: "INPROGRESS" });
      }
      return {
        todoId: args.todoId,
        attemptId: activeAttempt._id,
        status: "INPROGRESS",
        orchestration: "alreadyStarted",
      } as const;
    }

    if (todo.status !== "TODO" && todo.status !== "FAILED") {
      throw new ConvexError({
        code: "INVALID_STATUS_TRANSITION",
        message: `Cannot start todo from ${todo.status}.`,
      });
    }

    const attemptId = await ctx.db.insert("todoAttempts", {
      todoId: args.todoId,
      harnessId: runConfiguration.value.harnessId,
      runConfiguration: runConfiguration.value,
      streamState: "IDLE",
    });
    await ctx.db.patch("todos", args.todoId, {
      status: "INPROGRESS",
      prUrl: undefined,
      activeAttemptId: attemptId,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.integrations.notifications.sendDiscordWebhook,
      {
        content: `Todo ${args.todoId} moved ${todo.status} -> INPROGRESS`,
        context: { todoId: args.todoId, fromStatus: todo.status, toStatus: "INPROGRESS" },
      },
    );

    const githubUrl = todo.githubUrl?.trim();
    if (!githubUrl) {
      return {
        todoId: args.todoId,
        attemptId,
        status: "INPROGRESS",
        orchestration: "missingGithubUrl",
      } as const;
    }

    await ctx.scheduler.runAfter(
      0,
      internal.integrations.sandbox.spawnSandboxForTodo,
      { todoId: args.todoId, attemptId, githubUrl },
    );
    return {
      todoId: args.todoId,
      attemptId,
      status: "INPROGRESS",
      orchestration: "scheduled",
    } as const;
  },
});

export const updateDraft = mutation({
  args: {
    todoId: v.id("todos"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    githubUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuthenticated(ctx);
    const todo = await ctx.db.get("todos", args.todoId);
    if (!todo) throw new ConvexError({ code: "NOT_FOUND", message: "Todo not found" });
    if (todo.deleting) {
      throw new ConvexError({
        code: "TODO_DELETING",
        message: "Todo is being deleted.",
      });
    }
    if (todo.status !== "TODO" && todo.status !== "FAILED") {
      throw new ConvexError({
        code: "TODO_NOT_EDITABLE",
        message: "Todo fields can only be edited before an Attempt starts or after it fails.",
      });
    }

    const patch: { title?: string; description?: string; githubUrl?: string } = {};
    if (args.title !== undefined) {
      const title = args.title.trim();
      if (!title) throw new ConvexError({ code: "INVALID_TITLE", message: "Title cannot be empty" });
      patch.title = title;
    }
    if (args.description !== undefined) patch.description = args.description.trim() || undefined;
    if (args.githubUrl !== undefined) patch.githubUrl = args.githubUrl.trim() || undefined;
    if (Object.keys(patch).length > 0) await ctx.db.patch("todos", args.todoId, patch);
    return null;
  },
});

export const remove = mutation({
  args: { todoId: v.id("todos") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuthenticated(ctx);
    const todo = await ctx.db.get("todos", args.todoId);
    if (!todo) throw new ConvexError({ code: "NOT_FOUND", message: "Todo not found" });

    if (todo.deleting) return null;
    const activeAttempt = await getActiveAttempt(ctx, todo);
    await ctx.db.patch("todos", args.todoId, {
      deleting: true,
      activeAttemptId: undefined,
    });
    if (activeAttempt) {
      await ctx.db.patch("todoAttempts", activeAttempt._id, {
        streamState: "CANCELLED",
        terminalAt: Date.now(),
        terminalReason: "Todo deleted",
      });
      if (activeAttempt.sandboxId) {
        await ctx.scheduler.runAfter(
          0,
          internal.integrations.sandbox.stopSandboxForAttempt,
          {
            todoId: args.todoId,
            attemptId: activeAttempt._id,
            sandboxId: activeAttempt.sandboxId,
          },
        );
      }
    }

    const complete = await deleteTodoRecordsChunk(ctx, args.todoId);
    if (!complete) {
      await ctx.scheduler.runAfter(0, internal.todoRuns.deleteTodoRecordsBatch, {
        todoId: args.todoId,
      });
    }
    return null;
  },
});

async function deleteTodoRecordsChunk(ctx: MutationCtx, todoId: Id<"todos">) {
  const events = await ctx.db
    .query("todoEvents")
    .withIndex("by_todoId", (q) => q.eq("todoId", todoId))
    .take(DELETE_BATCH_SIZE);
  if (events.length > 0) {
    for (const event of events) await ctx.db.delete(event._id);
    return false;
  }
  const counts = await ctx.db
    .query("toolCallCounts")
    .withIndex("by_todoId", (q) => q.eq("todoId", todoId))
    .take(DELETE_BATCH_SIZE);
  if (counts.length > 0) {
    for (const count of counts) await ctx.db.delete(count._id);
    return false;
  }
  const attempts = await ctx.db
    .query("todoAttempts")
    .withIndex("by_todoId", (q) => q.eq("todoId", todoId))
    .take(DELETE_BATCH_SIZE);
  if (attempts.length > 0) {
    for (const attempt of attempts) await ctx.db.delete(attempt._id);
    return false;
  }
  await ctx.db.delete("todos", todoId);
  return true;
}

export const deleteTodoRecordsBatch = internalMutation({
  args: { todoId: v.id("todos") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!await ctx.db.get("todos", args.todoId)) return null;
    const complete = await deleteTodoRecordsChunk(ctx, args.todoId);
    if (!complete) {
      await ctx.scheduler.runAfter(0, internal.todoRuns.deleteTodoRecordsBatch, {
        todoId: args.todoId,
      });
    }
    return null;
  },
});

export const recordSandboxReady = internalMutation({
  args: { attemptId: v.id("todoAttempts"), sandboxId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const active = await getAttemptInActiveSlot(ctx, args.attemptId);
    if (!active) return false;
    await ctx.db.patch("todoAttempts", args.attemptId, { sandboxId: args.sandboxId });
    return true;
  },
});

export const recordOpencodeStarted = internalMutation({
  args: {
    attemptId: v.id("todoAttempts"),
    opencodeUrl: v.string(),
    sessionId: v.string(),
    startedAt: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const active = await getAttemptInActiveSlot(ctx, args.attemptId);
    if (!active) return false;
    await ctx.db.patch("todoAttempts", args.attemptId, {
      harnessUrl: args.opencodeUrl,
      harnessRunId: args.sessionId,
      startedAt: args.startedAt,
      streamState: "STARTED",
    });
    return true;
  },
});

export const recordPiStarted = internalMutation({
  args: {
    attemptId: v.id("todoAttempts"),
    commandId: v.string(),
    startedAt: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const active = await getAttemptInActiveSlot(ctx, args.attemptId);
    if (!active) return false;
    await ctx.db.patch("todoAttempts", args.attemptId, {
      harnessRunId: args.commandId,
      startedAt: args.startedAt,
      streamState: "STARTED",
    });
    return true;
  },
});

export const finish = internalMutation({
  args: {
    attemptId: v.id("todoAttempts"),
    streamState: attemptTerminalStateValidator,
    todoStatus: terminalTodoStatusValidator,
    terminalAt: v.number(),
    terminalReason: v.optional(v.string()),
    prUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const active = await getAttemptInActiveSlot(ctx, args.attemptId);
    if (!active) return null;
    const { attempt } = active;
    await ctx.db.patch("todoAttempts", args.attemptId, {
      streamState: args.streamState,
      terminalAt: args.terminalAt,
      terminalReason: args.terminalReason,
    });
    const prUrl = args.prUrl?.trim();
    await ctx.db.patch("todos", attempt.todoId, {
      status: args.todoStatus,
      prUrl: prUrl || undefined,
      activeAttemptId: undefined,
    });
    return null;
  },
});

export const failOrchestration = internalMutation({
  args: { attemptId: v.id("todoAttempts"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const active = await getAttemptInActiveSlot(ctx, args.attemptId);
    if (!active) return null;
    const { attempt } = active;
    await ctx.db.patch("todoAttempts", args.attemptId, {
      streamState: "FAILED",
      terminalAt: Date.now(),
      terminalReason: args.reason,
    });
    await ctx.db.patch("todos", attempt.todoId, {
      prUrl: undefined,
      status: "FAILED",
      activeAttemptId: undefined,
    });
    return null;
  },
});
