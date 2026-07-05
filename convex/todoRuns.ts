import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";
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

export const start = mutation({
  args: {
    todoId: v.id("todos"),
    runConfiguration: runConfigurationValidator,
  },
  returns: v.object({
    todoId: v.id("todos"),
    status: v.literal("INPROGRESS"),
    orchestration: orchestrationValidator,
  }),
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
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Todo not found",
      });
    }

    if (todo.status === "INPROGRESS") {
      return {
        todoId: args.todoId,
        status: "INPROGRESS",
        orchestration: "alreadyStarted",
      } as const;
    }

    if (todo.status !== "TODO") {
      throw new ConvexError({
        code: "INVALID_STATUS_TRANSITION",
        message: `Cannot start todo from ${todo.status}.`,
      });
    }

    await ctx.db.patch("todos", args.todoId, { status: "INPROGRESS" });

    const sandboxRow = await ctx.db
      .query("todoSandboxes")
      .withIndex("by_todoId", (q) => q.eq("todoId", args.todoId))
      .unique();

    if (sandboxRow) {
      await ctx.db.patch("todoSandboxes", sandboxRow._id, {
        runConfiguration: runConfiguration.value,
      });
    } else {
      await ctx.db.insert("todoSandboxes", {
        todoId: args.todoId,
        runConfiguration: runConfiguration.value,
        attempt: {
          streamState: "IDLE",
          shutdownSafe: false,
        },
      });
    }

    await ctx.scheduler.runAfter(
      0,
      internal.integrations.notifications.sendDiscordWebhook,
      {
        content: `Todo ${args.todoId} moved TODO -> INPROGRESS`,
        context: {
          todoId: args.todoId,
          fromStatus: "TODO",
          toStatus: "INPROGRESS",
        },
      },
    );

    const githubUrl = todo.githubUrl?.trim();
    if (!githubUrl) {
      return {
        todoId: args.todoId,
        status: "INPROGRESS",
        orchestration: "missingGithubUrl",
      } as const;
    }

    if (!sandboxRow?.sandboxId) {
      await ctx.scheduler.runAfter(
        0,
        internal.integrations.sandbox.spawnSandboxForTodo,
        {
          todoId: args.todoId,
          githubUrl,
          runConfiguration: runConfiguration.value,
        },
      );
    }

    return {
      todoId: args.todoId,
      status: "INPROGRESS",
      orchestration: sandboxRow?.sandboxId ? "alreadyStarted" : "scheduled",
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
    if (!todo) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Todo not found",
      });
    }

    if (todo.status !== "TODO") {
      throw new ConvexError({
        code: "TODO_NOT_EDITABLE",
        message: "Todo draft fields can only be edited before the todo starts.",
      });
    }

    const patch: {
      title?: string;
      description?: string | undefined;
      githubUrl?: string | undefined;
    } = {};

    if (args.title !== undefined) {
      const trimmed = args.title.trim();
      if (!trimmed) {
        throw new ConvexError({
          code: "INVALID_TITLE",
          message: "Title cannot be empty",
        });
      }
      patch.title = trimmed;
    }

    if (args.description !== undefined) {
      patch.description = args.description.trim() || undefined;
    }

    if (args.githubUrl !== undefined) {
      patch.githubUrl = args.githubUrl.trim() || undefined;
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch("todos", args.todoId, patch);
    }

    return null;
  },
});

export const remove = mutation({
  args: {
    todoId: v.id("todos"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuthenticated(ctx);

    const todo = await ctx.db.get("todos", args.todoId);
    if (!todo) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Todo not found",
      });
    }

    const sandboxRow = await ctx.db
      .query("todoSandboxes")
      .withIndex("by_todoId", (q) => q.eq("todoId", args.todoId))
      .unique();
    if (sandboxRow) {
      await ctx.db.delete("todoSandboxes", sandboxRow._id);
    }

    await ctx.db.delete("todos", args.todoId);
    return null;
  },
});

export const recordSandboxReady = internalMutation({
  args: {
    todoId: v.id("todos"),
    sandboxId: v.string(),
    runConfiguration: runConfigurationValidator,
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
        attempt: {
          streamState: "IDLE",
          shutdownSafe: false,
        },
        runConfiguration: args.runConfiguration,
      });
    } else {
      await ctx.db.insert("todoSandboxes", {
        todoId: args.todoId,
        sandboxId: args.sandboxId,
        runConfiguration: args.runConfiguration,
        attempt: {
          streamState: "IDLE",
          shutdownSafe: false,
        },
      });
    }

    return null;
  },
});

export const recordOpencodeStarted = internalMutation({
  args: {
    todoId: v.id("todos"),
    opencodeUrl: v.string(),
    sessionId: v.optional(v.string()),
    startedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("todoSandboxes")
      .withIndex("by_todoId", (q) => q.eq("todoId", args.todoId))
      .unique();
    if (!existing) {
      throw new Error(
        `No sandbox row for todo ${args.todoId}; cannot mark OpenCode as started`,
      );
    }

    await ctx.db.patch("todoSandboxes", existing._id, {
      attempt: {
        url: args.opencodeUrl,
        sessionId: args.sessionId,
        streamState: "STARTED",
        startedAt: args.startedAt,
        shutdownSafe: false,
      },
    });

    return null;
  },
});

export const finish = internalMutation({
  args: {
    todoId: v.id("todos"),
    streamState: attemptTerminalStateValidator,
    todoStatus: terminalTodoStatusValidator,
    terminalAt: v.number(),
    terminalReason: v.optional(v.string()),
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
        `No sandbox row for todo ${args.todoId}; cannot set lifecycle terminal state`,
      );
    }

    await ctx.db.patch("todoSandboxes", sandboxRow._id, {
      attempt: {
        ...sandboxRow.attempt,
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

export const failOrchestration = internalMutation({
  args: {
    todoId: v.id("todos"),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sandboxRow = await ctx.db
      .query("todoSandboxes")
      .withIndex("by_todoId", (q) => q.eq("todoId", args.todoId))
      .unique();

    if (sandboxRow) {
      await ctx.db.patch("todoSandboxes", sandboxRow._id, {
        attempt: {
          ...sandboxRow.attempt,
          streamState: "FAILED",
          terminalAt: Date.now(),
          terminalReason: args.reason,
          shutdownSafe: true,
        },
      });
    }

    await ctx.db.patch("todos", args.todoId, {
      prUrl: undefined,
      status: "FAILED",
    });

    return null;
  },
});
