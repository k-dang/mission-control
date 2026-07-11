import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { todoEventPayloadValidator } from "./lib/todoEventValidator";
import {
  attemptStreamStateValidator,
  runConfigurationValidator,
  todoStatusValidator,
} from "./lib/todoValidators";

export default defineSchema({
  todos: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    status: todoStatusValidator,
    githubUrl: v.optional(v.string()),
    prUrl: v.optional(v.string()),
    deleting: v.optional(v.boolean()),
  }).index("by_status", ["status"]),

  todoAttempts: defineTable({
    todoId: v.id("todos"),
    harnessId: v.literal("opencode"),
    runConfiguration: v.optional(runConfigurationValidator),
    sandboxId: v.optional(v.string()),
    harnessRunId: v.optional(v.string()),
    harnessUrl: v.optional(v.string()),
    streamState: attemptStreamStateValidator,
    startedAt: v.optional(v.number()),
    terminalAt: v.optional(v.number()),
    terminalReason: v.optional(v.string()),
    isActive: v.boolean(),
  })
    .index("by_todoId", ["todoId"])
    .index("by_todoId_and_isActive", ["todoId", "isActive"]),

  todoEvents: defineTable({
    todoId: v.id("todos"),
    attemptId: v.id("todoAttempts"),
    eventKey: v.string(),
    event: todoEventPayloadValidator,
  })
    .index("by_todoId", ["todoId"])
    .index("by_attemptId_and_eventKey", ["attemptId", "eventKey"])
    .index("by_attemptId", ["attemptId"]),

  toolCallCounts: defineTable({
    todoId: v.id("todos"),
    attemptId: v.id("todoAttempts"),
    count: v.number(),
    updatedAt: v.number(),
  })
    .index("by_todoId", ["todoId"])
    .index("by_todoId_and_attemptId", ["todoId", "attemptId"])
    .index("by_attemptId", ["attemptId"]),
});
