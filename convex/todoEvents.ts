import { v } from "convex/values";
import { requireAuthenticated } from "./authHelpers";
import { todoEventPayloadValidator } from "./lib/todoEventValidator";
import { incrementToolCallCount } from "./toolCallCounts";
import { internalMutation, query } from "./_generated/server";

const todoEventDocValidator = v.object({
  _id: v.id("todoEvents"),
  _creationTime: v.number(),
  todoId: v.id("todos"),
  attemptId: v.id("todoAttempts"),
  eventKey: v.string(),
  event: todoEventPayloadValidator,
});

export const append = internalMutation({
  args: {
    todoId: v.id("todos"),
    attemptId: v.id("todoAttempts"),
    eventKey: v.string(),
    event: todoEventPayloadValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("todoEvents")
      .withIndex("by_attemptId_and_eventKey", (q) =>
        q.eq("attemptId", args.attemptId).eq("eventKey", args.eventKey),
      )
      .unique();
    if (existing) {
      return null;
    }

    await ctx.db.insert("todoEvents", {
      todoId: args.todoId,
      attemptId: args.attemptId,
      eventKey: args.eventKey,
      event: args.event,
    });

    if (args.event.kind === "tool" && args.event.status === "running") {
      await incrementToolCallCount(ctx, {
        todoId: args.todoId,
        attemptId: args.attemptId,
      });
    }

    return null;
  },
});

const LIST_TAKE = 100;

export const listRecentForTodo = query({
  args: { todoId: v.id("todos") },
  returns: v.array(todoEventDocValidator),
  handler: async (ctx, args) => {
    await requireAuthenticated(ctx);

    const attempt = await ctx.db
      .query("todoAttempts")
      .withIndex("by_todoId", (q) => q.eq("todoId", args.todoId))
      .order("desc")
      .first();
    if (!attempt) return [];

    const events = await ctx.db
      .query("todoEvents")
      .withIndex("by_attemptId", (q) => q.eq("attemptId", attempt._id))
      .order("desc")
      .take(LIST_TAKE);
    return events.map((event) => ({ ...event, attemptId: attempt._id }));
  },
});
