import { v } from "convex/values";
import { requireAuthenticated } from "./authHelpers";
import { todoEventPayloadValidator } from "./lib/todoEventValidator";
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

    // Update tool counts in todoToolCounts table when we receive a tool_counts event
    if (args.event.kind === "tool_counts") {
      for (const [tool, count] of Object.entries(args.event.counts)) {
        const existingCount = await ctx.db
          .query("todoToolCounts")
          .withIndex("by_todoId_and_tool", (q) =>
            q.eq("todoId", args.todoId).eq("tool", tool),
          )
          .unique();

        if (existingCount) {
          await ctx.db.patch(existingCount._id, { count });
        } else {
          await ctx.db.insert("todoToolCounts", {
            todoId: args.todoId,
            opencodeSessionId: args.opencodeSessionId,
            tool,
            count,
          });
        }
      }
    }

    return null;
  },
});

const LIST_TAKE = 100;

const todoToolCountValidator = v.object({
  _id: v.id("todoToolCounts"),
  _creationTime: v.number(),
  todoId: v.id("todos"),
  opencodeSessionId: v.string(),
  tool: v.string(),
  count: v.number(),
});

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

export const listToolCountsForTodo = query({
  args: { todoId: v.id("todos") },
  returns: v.array(todoToolCountValidator),
  handler: async (ctx, args) => {
    await requireAuthenticated(ctx);

    return await ctx.db
      .query("todoToolCounts")
      .withIndex("by_todoId", (q) => q.eq("todoId", args.todoId))
      .collect();
  },
});
