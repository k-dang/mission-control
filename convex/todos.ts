import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { requireAuthenticated } from "./authHelpers";
import { todoDocValidator, todoStatusValidator } from "./lib/todoValidators";

export const getById = internalQuery({
  args: { todoId: v.id("todos") },
  returns: v.union(
    v.object({
      _id: v.id("todos"),
      _creationTime: v.number(),
      title: v.string(),
      description: v.optional(v.string()),
      status: todoStatusValidator,
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

export const get = query({
  args: { todoId: v.id("todos") },
  returns: v.union(todoDocValidator, v.null()),
  handler: async (ctx, args) => {
    await requireAuthenticated(ctx);

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

export const listByStatusPage = query({
  args: {
    status: todoStatusValidator,
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(todoDocValidator),
  handler: async (ctx, args) => {
    await requireAuthenticated(ctx);

    return await ctx.db
      .query("todos")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order("desc")
      .paginate(args.paginationOpts);
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
