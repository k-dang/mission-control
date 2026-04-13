# Plan: OpenCode SSE Ingestion

> Source PRD: `[specs/opencode-sse-ingestion.md](/Users/kevin/Documents/dev/convex-todo-app/specs/opencode-sse-ingestion.md)`

## Architectural decisions

Durable decisions that apply across all phases:

- **Schema**: Reuse the existing `todoSandboxes` table as the only durable record for OpenCode stream lifecycle; do not add run, message, or event tables.
- **Lifecycle model**: Persist only `IDLE`, `STARTED`, `COMPLETED`, `FAILED`, and `CANCELLED`, plus timestamps, optional terminal reason, optional upstream session id, and an explicit `opencodeShutdownSafe` boolean.
- **Read surface**: Keep the public read path small by extending the existing sandbox lookup by `todoId` rather than adding history or event queries.
- **Write surface**: Route all durable lifecycle changes through internal mutations in the existing sandbox storage layer.
- **Runtime boundary**: Keep OpenCode startup, stream monitoring, and sandbox shutdown orchestration in Convex actions; queries and mutations remain the source of truth for persisted state.
- **Shutdown rule**: Sandbox shutdown is allowed only after a terminal lifecycle write succeeds and marks `opencodeShutdownSafe = true`.
- **Replacement behavior**: Starting a new sandbox or new OpenCode run clears stale lifecycle fields on the current sandbox row before new lifecycle state is recorded.

---

## Phase 1: Persist Lifecycle On The Sandbox Record

**User stories**: Persist a durable stream-started state; persist a durable terminal state; expose a small read API for current lifecycle by `todoId`; do not build message, token, or raw SSE persistence.

### What to build

Extend the current sandbox record so Convex can answer, from a single row, whether OpenCode has never started, is active, or has reached a terminal state that makes shutdown safe. Keep the existing public sandbox read path, but include the new lifecycle fields in that response so callers do not need a separate query surface.

### Acceptance criteria

- The `todoSandboxes` record can store the OpenCode session id, lifecycle state, start timestamp, terminal timestamp, terminal reason, and shutdown-safety flag.
- The public sandbox read path by `todoId` returns the lifecycle fields alongside the existing sandbox metadata.
- No dedicated run, message, or raw-event storage is introduced.
- The lifecycle state shape is explicit enough to represent `IDLE`, `STARTED`, `COMPLETED`, `FAILED`, and `CANCELLED`.

---

## Phase 2: Mark OpenCode As Started

**User stories**: Starting OpenCode writes `opencodeStreamState = STARTED` and sets `opencodeStartedAt`; no messages or raw SSE frames are persisted anywhere in Convex.

### What to build

Update the OpenCode startup flow so that once session creation and stream monitoring are successfully established, Convex records a durable `STARTED` state on the sandbox row. Starting a new run should also clear any prior terminal metadata so the current row reflects only the active lifecycle for the current sandbox.

### Acceptance criteria

- A successful OpenCode startup writes `STARTED` and `opencodeStartedAt` to the sandbox row.
- The startup write can also save the upstream session id when available.
- Any stale terminal lifecycle fields from a prior run are cleared before or with the start transition.
- The implementation still does not persist messages, token deltas, or raw SSE frames.

---

## Phase 3: Detect Terminal States And Gate Shutdown

**User stories**: A terminal upstream condition writes `COMPLETED`, `FAILED`, or `CANCELLED`; the terminal write also sets `opencodeTerminalAt` and `opencodeShutdownSafe = true`; sandbox shutdown is attempted only after the terminal write succeeds.

### What to build

Add monitoring around the upstream OpenCode stream that listens only for semantic terminal outcomes. When a terminal outcome is observed, write the terminal lifecycle state durably in Convex and mark shutdown as safe in the same mutation. Only after that write succeeds should the sandbox shutdown action run.

### Acceptance criteria

- Normal completion records `COMPLETED`, a terminal timestamp, and `opencodeShutdownSafe = true`.
- Explicit upstream failure records `FAILED`, a terminal timestamp, and an explanatory terminal reason.
- Explicit upstream cancellation records `CANCELLED`, a terminal timestamp, and `opencodeShutdownSafe = true`.
- Shutdown is invoked only after the terminal-state mutation succeeds.
- If the system cannot confidently classify the stream as terminal, it does not mark shutdown as safe.

---

## Phase 4: Harden Replacement, Idempotency, And Failure Semantics

**User stories**: Repeated terminal signals are idempotent and do not corrupt state; public reads stay small and are served from the existing sandbox record; if the system cannot prove the stream is terminal, it does not mark shutdown as safe.

### What to build

Tighten the lifecycle rules so duplicate terminal signals converge safely, monitoring failures after a confirmed start become durable terminal failures, and ambiguous interruptions remain non-terminal. Align sandbox-row cleanup behavior with the new durability model so lifecycle state is not erased as a side effect of shutdown, and instead is reset only when the sandbox or run is intentionally replaced.

### Acceptance criteria

- Applying the same terminal outcome more than once leaves the sandbox row in a valid terminal state.
- A monitoring failure after a confirmed start records durable `FAILED` state before any shutdown attempt.
- Ambiguous disconnects or temporary interruptions do not set `opencodeShutdownSafe = true`.
- Lifecycle reads remain a single small query over the existing sandbox record.
- Replacing the sandbox or starting a new run clears stale lifecycle state without introducing a history model.