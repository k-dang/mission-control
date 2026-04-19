import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireAuthenticated } from "./authHelpers";

const statusValidator = v.union(
  v.literal("TODO"),
  v.literal("INPROGRESS"),
  v.literal("COMPLETED"),
  v.literal("FAILED"),
);

const todoValidator = v.object({
  _id: v.id("todos"),
  _creationTime: v.number(),
  title: v.string(),
  description: v.optional(v.string()),
  status: statusValidator,
  githubUrl: v.optional(v.string()),
  prUrl: v.optional(v.string()),
});

export const getById = internalQuery({
  args: { todoId: v.id("todos") },
  returns: v.union(
    v.object({
      _id: v.id("todos"),
      _creationTime: v.number(),
      title: v.string(),
      description: v.optional(v.string()),
      status: statusValidator,
      githubUrl: v.optional(v.string()),
      prUrl: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const todo = await ctx.db.get("todos", args.todoId);
    if (!todo) return null;
    return {
      _id: todo._id,
      _creationTime: todo._creationTime,
      title: todo.title,
      description: todo.description,
      status: todo.status,
      githubUrl: todo.githubUrl,
      prUrl: todo.prUrl,
    };
  },
});

export const updateInternal = internalMutation({
  args: {
    todoId: v.id("todos"),
    prUrl: v.optional(v.union(v.string(), v.null())),
    status: v.optional(statusValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const patch: {
      prUrl?: string | undefined;
      status?: "TODO" | "INPROGRESS" | "COMPLETED" | "FAILED";
    } = {};

    if (args.status !== undefined) {
      patch.status = args.status;
    }

    if (args.prUrl !== undefined) {
      patch.prUrl = args.prUrl?.trim() || undefined;
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch("todos", args.todoId, patch);
    }

    return null;
  },
});

export const listByStatus = query({
  args: {},
  returns: v.object({
    todo: v.array(todoValidator),
    inprogress: v.array(todoValidator),
    completed: v.array(todoValidator),
    failed: v.array(todoValidator),
  }),
  handler: async (ctx) => {
    await requireAuthenticated(ctx);

    const [todo, inprogress, completed, failed] = await Promise.all([
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
      ctx.db
        .query("todos")
        .withIndex("by_status", (q) => q.eq("status", "FAILED"))
        .order("desc")
        .collect(),
    ]);

    return {
      todo: todo.map((item) => ({
        _id: item._id,
        _creationTime: item._creationTime,
        title: item.title,
        description: item.description,
        status: item.status,
        githubUrl: item.githubUrl,
        prUrl: item.prUrl,
      })),
      inprogress: inprogress.map((item) => ({
        _id: item._id,
        _creationTime: item._creationTime,
        title: item.title,
        description: item.description,
        status: item.status,
        githubUrl: item.githubUrl,
        prUrl: item.prUrl,
      })),
      completed: completed.map((item) => ({
        _id: item._id,
        _creationTime: item._creationTime,
        title: item.title,
        description: item.description,
        status: item.status,
        githubUrl: item.githubUrl,
        prUrl: item.prUrl,
      })),
      failed: failed.map((item) => ({
        _id: item._id,
        _creationTime: item._creationTime,
        title: item.title,
        description: item.description,
        status: item.status,
        githubUrl: item.githubUrl,
        prUrl: item.prUrl,
      })),
    };
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    githubUrl: v.optional(v.string()),
  },
  returns: v.id("todos"),
  handler: async (ctx, args) => {
    await requireAuthenticated(ctx);

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

export const update = mutation({
  args: {
    todoId: v.id("todos"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(statusValidator),
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
        internal.todoNotifications.logTodoStatusTransition,
        {
          todoId: args.todoId,
          fromStatus,
          toStatus: args.status,
          timestampMs: Date.now(),
        },
      );

      const sandboxRow = await ctx.db
        .query("todoSandboxes")
        .withIndex("by_todoId", (q) => q.eq("todoId", args.todoId))
        .unique();

      if (
        args.status === "INPROGRESS" &&
        (args.githubUrl?.trim() || todo.githubUrl) &&
        !sandboxRow
      ) {
        await ctx.scheduler.runAfter(0, internal.sandbox.spawnSandboxForTodo, {
          todoId: args.todoId,
          githubUrl: args.githubUrl?.trim() || todo.githubUrl!,
        });
      }

      if (args.status === "COMPLETED" && sandboxRow?.sandboxId) {
        await ctx.scheduler.runAfter(
          0,
          internal.sandbox.shutdownSandboxForTodo,
          {
            todoId: args.todoId,
            sandboxId: sandboxRow.sandboxId,
          },
        );
      }
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
