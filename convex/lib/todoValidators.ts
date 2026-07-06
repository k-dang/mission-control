import { v } from "convex/values";

export const todoStatusValidator = v.union(
  v.literal("TODO"),
  v.literal("INPROGRESS"),
  v.literal("COMPLETED"),
  v.literal("FAILED"),
);

export const attemptStreamStateValidator = v.union(
  v.literal("IDLE"),
  v.literal("STARTED"),
  v.literal("COMPLETED"),
  v.literal("FAILED"),
  v.literal("CANCELLED"),
);

export const attemptTerminalStateValidator = v.union(
  v.literal("COMPLETED"),
  v.literal("FAILED"),
  v.literal("CANCELLED"),
);

export const terminalTodoStatusValidator = v.union(
  v.literal("COMPLETED"),
  v.literal("FAILED"),
);

export const runConfigurationProviderIdValidator = v.union(
  v.literal("vercel"),
  v.literal("openrouter"),
  v.literal("opencode"),
);

export const runConfigurationHarnessIdValidator = v.literal("opencode");

export const runConfigurationValidator = v.object({
  harnessId: v.optional(runConfigurationHarnessIdValidator),
  providerId: runConfigurationProviderIdValidator,
  modelId: v.string(),
});

export const todoDocValidator = v.object({
  _id: v.id("todos"),
  _creationTime: v.number(),
  title: v.string(),
  description: v.optional(v.string()),
  status: todoStatusValidator,
  githubUrl: v.optional(v.string()),
  prUrl: v.optional(v.string()),
});

export const attemptStateValidator = v.object({
  url: v.optional(v.string()),
  sessionId: v.optional(v.string()),
  streamState: attemptStreamStateValidator,
  startedAt: v.optional(v.number()),
  terminalAt: v.optional(v.number()),
  terminalReason: v.optional(v.string()),
  shutdownSafe: v.boolean(),
});

export const sandboxRowValidator = v.object({
  _id: v.id("todoSandboxes"),
  _creationTime: v.number(),
  todoId: v.id("todos"),
  sandboxId: v.optional(v.string()),
  runConfiguration: v.optional(runConfigurationValidator),
  attempt: attemptStateValidator,
});
