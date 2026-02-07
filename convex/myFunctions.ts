import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";

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
  },
  returns: v.id("todos"),
  handler: async (ctx, args) => {
    const title = args.title.trim();
    const description = args.description?.trim();

    if (!title) {
      throw new ConvexError({
        code: "INVALID_TITLE",
        message: "Title is required",
      });
    }

    return await ctx.db.insert("todos", {
      title,
      description: description ? description : undefined,
      status: "TODO",
    });
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

    await ctx.db.patch("todos", args.todoId, { status: "INPROGRESS" });
    return null;
  },
});
