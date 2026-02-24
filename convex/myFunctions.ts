import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, mutation, query } from "./_generated/server";

const statusValidator = v.union(
  v.literal("TODO"),
  v.literal("INPROGRESS"),
  v.literal("COMPLETED"),
);

const todoValidator = v.object({
  _id: v.id("todos"),
  _creationTime: v.number(),
  title: v.string(),
  description: v.optional(v.string()),
  status: statusValidator,
  githubUrl: v.optional(v.string()),
  sandboxId: v.optional(v.string()),
  sandboxUrl: v.optional(v.string()),
});

export const listTodos = query({
  args: {},
  returns: v.object({
    todo: v.array(todoValidator),
    inprogress: v.array(todoValidator),
    completed: v.array(todoValidator),
  }),
  handler: async (ctx) => {
    const [todo, inprogress, completed] = await Promise.all([
      ctx.db
        .query("todos")
        .withIndex("by_status", (q) => q.eq("status", "TODO"))
        .order("desc")
        .collect(),
      ctx.db
        .query("todos")
        .withIndex("by_status", (q) => q.eq("status", "INPROGRESS"))
        .order("desc")
        .collect(),
      ctx.db
        .query("todos")
        .withIndex("by_status", (q) => q.eq("status", "COMPLETED"))
        .order("desc")
        .collect(),
    ]);

    return { todo, inprogress, completed };
  },
});

export const createTodo = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    githubUrl: v.optional(v.string()),
  },
  returns: v.id("todos"),
  handler: async (ctx, args) => {
    const title = args.title.trim();
    const description = args.description?.trim();
    const githubUrl = args.githubUrl?.trim();

    if (!title) {
      throw new ConvexError({
        code: "INVALID_TITLE",
        message: "Title is required",
      });
    }

    return await ctx.db.insert("todos", {
      title,
      description: description ? description : undefined,
      githubUrl: githubUrl ? githubUrl : undefined,
      status: "TODO",
    });
  },
});

export const logTodoStatusTransition = internalAction({
  args: {
    todoId: v.id("todos"),
    fromStatus: statusValidator,
    toStatus: statusValidator,
    timestampMs: v.number(),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn(
        "DISCORD_WEBHOOK_URL is not configured; skipping todo status webhook",
        args,
      );
      return null;
    }

    const timestampIso = new Date(args.timestampMs).toISOString();
    const content = `Todo ${args.todoId} moved ${args.fromStatus} -> ${args.toStatus} at ${timestampIso}`;

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        const responseBody = await response.text();
        console.error("Discord webhook request failed", {
          status: response.status,
          statusText: response.statusText,
          responseBody: responseBody.slice(0, 500),
          ...args,
        });
      }
    } catch (error) {
      console.error("Discord webhook request threw an error", {
        error: error instanceof Error ? error.message : String(error),
        ...args,
      });
    }

    return null;
  },
});

export const moveTodoToInProgress = mutation({
  args: {
    todoId: v.id("todos"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const todo = await ctx.db.get("todos", args.todoId);

    if (!todo) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Todo not found",
      });
    }

    if (todo.status === "INPROGRESS") {
      return null;
    }

    if (todo.status !== "TODO") {
      throw new ConvexError({
        code: "INVALID_TRANSITION",
        message: "Only TODO items can move to INPROGRESS",
      });
    }

    const fromStatus = todo.status;
    await ctx.db.patch("todos", args.todoId, { status: "INPROGRESS" });
    await ctx.scheduler.runAfter(
      0,
      internal.myFunctions.logTodoStatusTransition,
      {
        todoId: args.todoId,
        fromStatus,
        toStatus: "INPROGRESS",
        timestampMs: Date.now(),
      },
    );
    if (todo.githubUrl) {
      await ctx.scheduler.runAfter(0, internal.sandbox.spawnSandboxForTodo, {
        todoId: args.todoId,
        githubUrl: todo.githubUrl,
      });
    }
    return null;
  },
});

export const updateTodo = mutation({
  args: {
    todoId: v.id("todos"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(statusValidator),
    githubUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const todo = await ctx.db.get(args.todoId);
    if (!todo) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Todo not found",
      });
    }

    const patch: Record<string, unknown> = {};

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

    if (args.status !== undefined && args.status !== todo.status) {
      const fromStatus = todo.status;
      patch.status = args.status;

      await ctx.scheduler.runAfter(
        0,
        internal.myFunctions.logTodoStatusTransition,
        {
          todoId: args.todoId,
          fromStatus,
          toStatus: args.status,
          timestampMs: Date.now(),
        },
      );

      if (
        args.status === "INPROGRESS" &&
        (args.githubUrl?.trim() || todo.githubUrl)
      ) {
        await ctx.scheduler.runAfter(0, internal.sandbox.spawnSandboxForTodo, {
          todoId: args.todoId,
          githubUrl: args.githubUrl?.trim() || todo.githubUrl!,
        });
      }
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.todoId, patch);
    }

    return null;
  },
});

export const deleteTodo = mutation({
  args: {
    todoId: v.id("todos"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const todo = await ctx.db.get(args.todoId);
    if (!todo) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Todo not found",
      });
    }
    await ctx.db.delete(args.todoId);
    return null;
  },
});

export const saveSandboxResult = internalMutation({
  args: {
    todoId: v.id("todos"),
    sandboxId: v.string(),
    sandboxUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.todoId, {
      sandboxId: args.sandboxId,
      sandboxUrl: args.sandboxUrl,
    });
    return null;
  },
});
