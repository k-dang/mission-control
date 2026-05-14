import { type Infer, v } from "convex/values";

/**
 * Discriminated-union validator for a curated slice of OpenCode SSE events
 * that we persist per-todo so the UI can stream them reactively.
 *
 * Shared between `schema.ts` (stored shape), `todoEvents.ts` (function args),
 * and `lib/opencodeEventProjector.ts` (producer) so the shapes stay in lockstep.
 */
export const todoEventPayloadValidator = v.union(
  v.object({
    kind: v.literal("session_status"),
    statusType: v.string(),
    message: v.optional(v.string()),
    attempt: v.optional(v.number()),
    next: v.optional(v.number()),
  }),
  v.object({
    kind: v.literal("session_compacted"),
  }),
  v.object({
    kind: v.literal("step_start"),
    messageId: v.string(),
    agent: v.optional(v.string()),
    model: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal("step_finish"),
    messageId: v.string(),
    reason: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal("tool"),
    tool: v.string(),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("error"),
    ),
    title: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal("patch"),
    fileCount: v.number(),
    files: v.array(v.string()),
  }),
  v.object({
    kind: v.literal("compaction"),
    auto: v.boolean(),
    summary: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal("subtask"),
    agent: v.string(),
    description: v.string(),
  }),
  v.object({
    kind: v.literal("todo_updated"),
    todoCount: v.number(),
    summary: v.string(),
  }),
  v.object({
    kind: v.literal("error"),
    message: v.string(),
  }),
);

export type TodoEventPayload = Infer<typeof todoEventPayloadValidator>;

/**
 * Shape passed to `internal.todoEvents.append`, minus the `todoId`/`sessionId`
 * the caller already knows. Producers build this from opencode SSE events.
 */
export type TodoEventInput = {
  eventKey: string;
  event: TodoEventPayload;
};
