import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { todoEventPayloadValidator } from "./lib/todoEventValidator";
import {
  attemptStateValidator,
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
  }).index("by_status", ["status"]),

  todoSandboxes: defineTable({
    todoId: v.id("todos"),
    sandboxId: v.optional(v.string()),
    runConfiguration: v.optional(runConfigurationValidator),
    attempt: attemptStateValidator,
  }).index("by_todoId", ["todoId"]),

  todoEvents: defineTable({
    todoId: v.id("todos"),
    attemptId: v.string(),
    eventKey: v.string(),
    event: todoEventPayloadValidator,
  })
    .index("by_todoId", ["todoId"])
    .index("by_todoId_and_eventKey", ["todoId", "eventKey"]),

  toolCallCounts: defineTable({
    todoId: v.id("todos"),
    attemptId: v.string(),
    count: v.number(),
    updatedAt: v.number(),
  })
    .index("by_todoId", ["todoId"])
    .index("by_todoId_and_attemptId", ["todoId", "attemptId"]),
});
