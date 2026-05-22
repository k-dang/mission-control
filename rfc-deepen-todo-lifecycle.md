## Problem

Todo lifecycle behavior is currently split across shallow modules that each own a small part of one larger workflow:

- `convex/todos.ts` validates public todo edits, performs the `TODO -> INPROGRESS` status transition, schedules Discord notifications, checks sandbox idempotency, and schedules sandbox creation.
- `convex/sandbox.ts` creates the Vercel Sandbox, records the sandbox id through `todoSandboxes`, and schedules OpenCode.
- `convex/opencode.ts` starts OpenCode, monitors the stream, creates a pull request, records terminal outcome, sends completion notifications, and shuts down the sandbox.
- `convex/todoSandboxes.ts` and `convex/todoSessionState.ts` own storage mechanics for lifecycle state, but callers still need to know when each mutation should be called.

The architectural friction is that a UI operation that looks like a field patch:

```ts
api.todos.update({ todoId, status: "INPROGRESS" });
```

actually means "start this todo's automation lifecycle." That one status update can trigger notification scheduling, sandbox creation, OpenCode setup, stream monitoring, pull request creation, terminal status updates, and sandbox shutdown.

This makes the code harder to navigate because understanding "start a todo" requires reading storage mutations, scheduled actions, sandbox helpers, OpenCode orchestration, and terminal-state persistence. It also creates integration risk at the seams: future callers can accidentally treat `status` as ordinary editable data even though `INPROGRESS` has workflow side effects.

The shallow-module split also weakens testability. Tests are pushed toward internals like event callbacks, DB patch helpers, or individual action branches, while the important behavior is at the lifecycle boundary: whether a todo can start, whether the start is idempotent, what work is scheduled, and how terminal outcomes update durable state.

## Proposed Interface

Create a deep lifecycle module centered on `convex/todoLifecycle.ts`. Shape the public API around UI/domain actions rather than raw storage patches.

Public functions:

```ts
export const start = mutation({
  args: {
    todoId: v.id("todos"),
  },
  returns: v.object({
    todoId: v.id("todos"),
    status: v.literal("INPROGRESS"),
    orchestration: v.union(
      v.literal("scheduled"),
      v.literal("alreadyStarted"),
      v.literal("missingGithubUrl"),
    ),
  }),
  handler: async (ctx, args) => {
    // Authenticate caller.
    // Validate TODO -> INPROGRESS.
    // Patch todo status.
    // Check sandbox idempotency.
    // Schedule lifecycle side effects.
  },
});

export const updateDraft = mutation({
  args: {
    todoId: v.id("todos"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    githubUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Authenticate caller.
    // Only allow draft metadata edits while the todo is TODO.
  },
});

export const remove = mutation({
  args: {
    todoId: v.id("todos"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Authenticate caller.
    // Delete the todo and lifecycle-owned rows.
  },
});
```

Internal lifecycle mutations:

```ts
export const recordSandboxReady = internalMutation({
  args: {
    todoId: v.id("todos"),
    sandboxId: v.string(),
  },
  returns: v.null(),
});

export const recordOpencodeStarted = internalMutation({
  args: {
    todoId: v.id("todos"),
    opencodeUrl: v.string(),
    sessionId: v.optional(v.string()),
    startedAt: v.number(),
  },
  returns: v.null(),
});

export const finish = internalMutation({
  args: {
    todoId: v.id("todos"),
    streamState: v.union(
      v.literal("COMPLETED"),
      v.literal("FAILED"),
      v.literal("CANCELLED"),
    ),
    todoStatus: v.union(v.literal("COMPLETED"), v.literal("FAILED")),
    terminalAt: v.number(),
    terminalReason: v.optional(v.string()),
    prUrl: v.optional(v.string()),
  },
  returns: v.null(),
});

export const failOrchestration = internalMutation({
  args: {
    todoId: v.id("todos"),
    reason: v.string(),
  },
  returns: v.null(),
});
```

Usage from the UI:

```ts
const startTodo = useMutation(api.todoLifecycle.start);

await startTodo({ todoId });
```

Draft field edits stay separate from lifecycle commands:

```ts
const updateDraft = useMutation(api.todoLifecycle.updateDraft);

await updateDraft({
  todoId,
  title,
  description,
  githubUrl,
});
```

Usage from scheduled actions:

```ts
await ctx.runMutation(internal.todoLifecycle.recordSandboxReady, {
  todoId,
  sandboxId: sandbox.sandboxId,
});
```

```ts
await ctx.runMutation(internal.todoLifecycle.finish, {
  todoId,
  streamState: outcome.terminalState,
  todoStatus: resolved.todoStatus,
  terminalAt: outcome.terminalAt,
  terminalReason: resolved.terminalReason,
  prUrl: resolved.prUrl,
});
```

This interface hides:

- status transition rules
- draft editability rules
- sandbox idempotency checks
- lifecycle scheduling decisions
- OpenCode lifecycle state storage
- terminal todo status and PR URL updates
- failure normalization to `FAILED`
- cleanup-safe terminal marking

The UI should never need to know that `INPROGRESS` is the storage representation of "started." It should call a lifecycle command.

## Dependency Strategy

This refactor is primarily **Local-substitutable** with clear **True external** boundaries.

The durable lifecycle state is local to Convex and can be tested with `convex-test`. The deep module should own all database transitions across `todos` and `todoSandboxes`, using indexed reads like `todoSandboxes.by_todoId` for idempotency. Public lifecycle mutations authenticate with `requireAuthenticated(ctx)`. Internal lifecycle mutations are private APIs called only through generated `internal` references.

External systems remain behind action boundaries:

- Vercel Sandbox stays in `internalAction` code such as `convex/sandbox.ts`.
- OpenCode setup, stream monitoring, and PR creation stay in `internalAction` code such as `convex/opencode.ts`.
- Discord webhook delivery stays in `convex/notifications.ts`.
- GitHub PR creation remains in the PR creation helper/action path.

The lifecycle module should not erase Convex's runtime split. Mutations decide and persist lifecycle state. Actions perform external I/O and call internal lifecycle mutations to record outcomes. Actions must not use `ctx.db` directly.

Scheduled Convex functions are a remote-but-owned boundary. `todoLifecycle.start` should schedule owned internal actions, and those actions should report back through `internal.todoLifecycle.*` mutations instead of directly patching lifecycle tables.

## Testing Strategy

New boundary tests to write:

- Starting a `TODO` todo moves it to `INPROGRESS`.
- Starting a todo with a GitHub URL schedules sandbox orchestration.
- Starting a todo without a GitHub URL returns `missingGithubUrl` and does not schedule sandbox creation.
- Starting an already-started todo is idempotent and returns `alreadyStarted`.
- Starting from `COMPLETED` or `FAILED` is rejected.
- Draft metadata updates are allowed while `TODO`.
- Draft metadata updates are rejected after the todo has started.
- `recordSandboxReady` creates or updates the sandbox lifecycle row without duplicating rows.
- `recordOpencodeStarted` records URL, session id, start time, and `STARTED` state.
- `finish` updates both the todo status/PR URL and the sandbox terminal state in one lifecycle boundary.
- `failOrchestration` marks the todo failed and records a terminal reason suitable for debugging.
- `remove` deletes the todo and owned lifecycle rows.

Old tests to delete or avoid adding:

- Tests that assert isolated storage helpers such as "patch this field on todoSandboxes" once those helpers become private implementation details.
- Tests that call `todos.update({ status: "INPROGRESS" })` as the lifecycle entry point.
- Tests that separately verify todo terminal status patching and sandbox terminal patching when `todoLifecycle.finish` covers the observable behavior.

Test environment needs:

- Use `convex-test` with `vitest` and the Convex module map for lifecycle mutation boundary tests.
- Keep external Sandbox/OpenCode/GitHub/Discord behavior mocked at action or adapter boundaries.
- Where scheduler assertions are awkward in `convex-test`, make scheduling decisions return explicit lifecycle results or isolate scheduling behind small helpers that can be asserted without reaching external services.

## Implementation Recommendations

The lifecycle module should own:

- public start semantics
- draft editability policy
- valid lifecycle transitions
- idempotency for starting and sandbox recording
- durable lifecycle state across `todos` and `todoSandboxes`
- terminal mapping from OpenCode outcomes to todo status
- scheduling decisions for the next owned internal action

The lifecycle module should hide:

- how `INPROGRESS` is represented in storage
- which table stores OpenCode URL/session state
- how terminal state is split between todo status and sandbox lifecycle fields
- whether a start schedules Discord, Sandbox, OpenCode, or future lifecycle work
- how failed external orchestration becomes a durable failure state

The lifecycle module should expose:

- simple public commands for UI workflows: `start`, `updateDraft`, and `remove`
- internal mutations for action callbacks: `recordSandboxReady`, `recordOpencodeStarted`, `finish`, and `failOrchestration`

Migration should proceed in small steps:

1. Add `convex/todoLifecycle.ts` with `start` implemented by moving the `TODO -> INPROGRESS` branch out of `todos.update`.
2. Update the board and detail UI to call `api.todoLifecycle.start` instead of `api.todos.update({ status: "INPROGRESS" })`.
3. Narrow `todos.update` or replace its public usage with `todoLifecycle.updateDraft` so generic updates no longer start automation.
4. Move `todoSandboxes.saveSandboxResult` and `markOpencodeStarted` behavior behind `internal.todoLifecycle.recordSandboxReady` and `recordOpencodeStarted`.
5. Replace `todoSessionState.setTerminalState` and failure calls to `todos.updateInternal` with `internal.todoLifecycle.finish` and `failOrchestration`.
6. Keep `sandbox.ts`, `opencode.ts`, `notifications.ts`, and PR helpers responsible for external mechanics, but make them report lifecycle facts through `internal.todoLifecycle`.

The durable rule: callers should express lifecycle facts, not storage patches. Starting a todo is `todoLifecycle.start`, terminal completion is `todoLifecycle.finish`, and draft edits are `todoLifecycle.updateDraft`.
