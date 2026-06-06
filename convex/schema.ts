import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { todoEventPayloadValidator } from "./lib/todoEventValidator";
import {
  opencodeStateValidator,
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
    runConfiguration: v.optional(runConfigurationValidator),
  }).index("by_status", ["status"]),

  todoSandboxes: defineTable({
    todoId: v.id("todos"),
    sandboxId: v.string(),
    runConfiguration: v.optional(runConfigurationValidator),
    opencode: opencodeStateValidator,
  }).index("by_todoId", ["todoId"]),

  todoEvents: defineTable({
    todoId: v.id("todos"),
    opencodeSessionId: v.string(),
    eventKey: v.string(),
    event: todoEventPayloadValidator,
  })
    .index("by_todoId", ["todoId"])
    .index("by_todoId_and_eventKey", ["todoId", "eventKey"]),

  opencodeToolCallCounts: defineTable({
    todoId: v.id("todos"),
    opencodeSessionId: v.string(),
    count: v.number(),
    updatedAt: v.number(),
  })
    .index("by_todoId", ["todoId"])
    .index("by_todoId_and_opencodeSessionId", ["todoId", "opencodeSessionId"]),
});
