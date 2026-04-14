import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  todos: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("TODO"),
      v.literal("INPROGRESS"),
      v.literal("COMPLETED"),
      v.literal("FAILED"),
    ),
    githubUrl: v.optional(v.string()),
    prUrl: v.optional(v.string()),
  }).index("by_status", ["status"]),

  todoSandboxes: defineTable({
    todoId: v.id("todos"),
    sandboxId: v.string(),
    opencode: v.object({
      url: v.optional(v.string()),
      sessionId: v.optional(v.string()),
      streamState: v.union(
        v.literal("IDLE"),
        v.literal("STARTED"),
        v.literal("COMPLETED"),
        v.literal("FAILED"),
        v.literal("CANCELLED"),
      ),
      startedAt: v.optional(v.number()),
      terminalAt: v.optional(v.number()),
      terminalReason: v.optional(v.string()),
      shutdownSafe: v.boolean(),
    }),
  }).index("by_todoId", ["todoId"]),
});
