import { v } from "convex/values";
import {
  internalMutation,
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

const opencodeTerminalStateValidator = v.union(
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
        opencode: {
          streamState: "IDLE",
          shutdownSafe: false,
        },
      });
    } else {
      await ctx.db.insert("todoSandboxes", {
        todoId: args.todoId,
        sandboxId: args.sandboxId,
        opencode: {
          streamState: "IDLE",
          shutdownSafe: false,
        },
      });
    }
    return null;
  },
});

export const markOpencodeStarted = internalMutation({
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
      opencode: {
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

export const setOpencodeTerminalState = internalMutation({
  args: {
    todoId: v.id("todos"),
    streamState: opencodeTerminalStateValidator,
    terminalAt: v.number(),
    terminalReason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("todoSandboxes")
      .withIndex("by_todoId", (q) => q.eq("todoId", args.todoId))
      .unique();
    if (!existing) {
      throw new Error(
        `No sandbox row for todo ${args.todoId}; cannot set OpenCode terminal state`,
      );
    }

    await ctx.db.patch("todoSandboxes", existing._id, {
      opencode: {
        ...existing.opencode,
        streamState: args.streamState,
        terminalAt: args.terminalAt,
        terminalReason: args.terminalReason,
        shutdownSafe: true,
      },
    });
    return null;
  },
});