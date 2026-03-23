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
    ),
    githubUrl: v.optional(v.string()),
    sandboxId: v.optional(v.string()),
    sandboxUrl: v.optional(v.string()),
    prUrl: v.optional(v.string()),
  }).index("by_status", ["status"]),
});
