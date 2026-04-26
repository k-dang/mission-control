import { v } from "convex/values";
import { requireAuthenticated } from "./authHelpers";
import { todoEventPayloadValidator } from "./lib/todoEventValidator";
import { incrementToolCallCount } from "./opencodeToolCallCounts";
import { internalMutation, query } from "./_generated/server";

const todoEventDocValidator = v.object({
  _id: v.id("todoEvents"),
  _creationTime: v.number(),
  todoId: v.id("todos"),
  opencodeSessionId: v.string(),
  eventKey: v.string(),
  event: todoEventPayloadValidator,
});

export const append = internalMutation({
  args: {
    todoId: v.id("todos"),
    opencodeSessionId: v.string(),
    eventKey: v.string(),
    event: todoEventPayloadValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("todoEvents")
      .withIndex("by_todoId_and_eventKey", (q) =>
        q.eq("todoId", args.todoId).eq("eventKey", args.eventKey),
      )
      .unique();
    if (existing) {
      return null;
    }

    await ctx.db.insert("todoEvents", {
      todoId: args.todoId,
      opencodeSessionId: args.opencodeSessionId,
      eventKey: args.eventKey,
      event: args.event,
    });

    if (args.event.kind === "tool" && args.event.status === "running") {
      await incrementToolCallCount(ctx, {
        todoId: args.todoId,
        opencodeSessionId: args.opencodeSessionId,
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

    return await ctx.db
      .query("todoEvents")
      .withIndex("by_todoId", (q) => q.eq("todoId", args.todoId))
      .order("desc")
      .take(LIST_TAKE);
  },
});
