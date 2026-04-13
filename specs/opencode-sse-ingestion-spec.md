# OpenCode Stream Lifecycle — Simplified Spec

**Status:** Draft
**Type:** Feature plan
**Effort:** S
**Date:** 2026-04-06

## Problem Statement

**Who:** Developers using this app to run OpenCode inside a sandbox for a todo.

**What:** The current OpenCode integration starts a session and submits a prompt, but it does not persist enough lifecycle state to know when the upstream event stream has definitively finished.

**Why it matters:** Sandbox shutdown is a destructive action. We need one durable signal in Convex that says either "the stream started" or "the stream reached a terminal state and shutdown is now safe." We do not need message storage, token storage, or rich progress tracking for this version.

**Evidence:** [convex/opencode.ts](/Users/kevin/Documents/dev/convex-todo-app/convex/opencode.ts) starts OpenCode and submits the prompt. [convex/sandboxStorage.ts](/Users/kevin/Documents/dev/convex-todo-app/convex/sandboxStorage.ts) stores sandbox metadata and a coarse failure path, but nothing durable about OpenCode stream lifecycle.

## Recommendation

Do not build a run table. Do not build a message table. Do not persist SSE frames.

Instead, extend the existing `todoSandboxes` row with the minimum lifecycle fields needed to answer two questions:

- did the OpenCode stream successfully start?
- has the stream reached a terminal state such that sandbox shutdown is safe?

This keeps the implementation aligned with the real product need and avoids building an event model the app does not use.

## In Scope

- Persist a durable "stream started" state.
- Persist a durable terminal state.
- Persist enough metadata to know whether sandbox shutdown is safe.
- Expose a small read API for the current lifecycle state by `todoId`.
- Trigger sandbox shutdown only after durable terminal-state persistence succeeds.

## Explicitly Out of Scope

- Storing any messages.
- Storing token deltas or raw SSE events.
- Historical run retention.
- Rich intermediate phases.
- Tool call visibility.
- Generic provider event ingestion.
- Browser-facing live SSE proxying.

## Proposed Model

Reuse `todoSandboxes` as the only durable record for this concern.

Add OpenCode lifecycle fields to `todoSandboxes`:

- `opencodeSessionId`: optional upstream session id
- `opencodeStreamState`: enum string
- `opencodeStartedAt`: optional timestamp
- `opencodeTerminalAt`: optional timestamp
- `opencodeTerminalReason`: optional string
- `opencodeShutdownSafe`: boolean

Recommended `opencodeStreamState` values:

- `IDLE`: no OpenCode stream has started for the current sandbox
- `STARTED`: stream setup succeeded and monitoring has begun
- `COMPLETED`: upstream stream ended successfully
- `FAILED`: upstream stream ended with an error
- `CANCELLED`: upstream stream ended due to explicit cancellation

This model intentionally does not represent non-terminal progress. The only non-idle active state is `STARTED`.

## Shutdown Rule

Sandbox shutdown is safe only when all of the following are true:

- `opencodeStreamState` is one of `COMPLETED`, `FAILED`, or `CANCELLED`
- `opencodeTerminalAt` is set
- `opencodeShutdownSafe` is `true`

`opencodeShutdownSafe` must be written in the same mutation that records the terminal state. Do not infer shutdown safety only from an in-memory event or from a best-effort action path.

The operational rule is:

1. receive a terminal upstream condition
2. persist terminal state in Convex
3. mark `opencodeShutdownSafe = true`
4. only then call sandbox shutdown

If shutdown fails after that point, the system may retry shutdown safely because the durable record already says the stream is terminal.

## Event Mapping

Persist only these semantic transitions:

- stream accepted or monitoring started -> `STARTED`
- stream completed normally -> `COMPLETED`
- stream failed -> `FAILED`
- stream cancelled -> `CANCELLED`

Ignore:

- message content
- token deltas
- heartbeats
- keepalives
- non-terminal provider chatter

## Interface Contract

The internal contract should stay small:

- `runOpencodeForTodo` starts OpenCode, creates the session, and marks the sandbox row as `STARTED`
- a monitoring action watches the upstream stream for a terminal condition
- all durable writes happen through internal mutations
- sandbox shutdown runs only after the terminal mutation succeeds

Suggested internal write surface:

- `markOpencodeStarted`
- `setOpencodeTerminalState`
- `clearOpencodeLifecycle` when a new sandbox or new run replaces the old state

Suggested public read surface:

- `getForTodo` returns sandbox metadata plus the current OpenCode lifecycle fields

No additional public history or message queries are needed.

## Durability Model

The stream connection is ephemeral. The lifecycle state in Convex is the source of truth.

Durability requirements for this version:

- once the stream is considered started, that state is written to Convex
- once a terminal condition is observed, that state is written to Convex before shutdown
- duplicate terminal signals converge to the same terminal row state
- shutdown may be retried when `opencodeShutdownSafe` is already `true`

This version does not need general resume logic. If the monitoring action crashes before a terminal write happens, the sandbox must be treated as not yet safe to shut down by lifecycle rules alone.

## Failure Semantics

Treat these as terminal:

- explicit upstream completion event
- explicit upstream failure event
- explicit upstream cancellation event
- unrecoverable monitoring error after the stream had started

For the last case, the terminal state should be `FAILED`, and the stored `opencodeTerminalReason` should describe the monitoring failure.

Treat these as non-terminal:

- transient reconnect attempt
- heartbeat timeout without a final classification
- temporary transport interruption while recovery is still in progress

If the system cannot classify the stream as terminal with confidence, it must not mark `opencodeShutdownSafe = true`.

## Acceptance Criteria

- Starting OpenCode writes `opencodeStreamState = STARTED` and sets `opencodeStartedAt`.
- No messages or raw SSE frames are persisted anywhere in Convex.
- A terminal upstream condition writes one of `COMPLETED`, `FAILED`, or `CANCELLED`.
- The terminal write also sets `opencodeTerminalAt` and `opencodeShutdownSafe = true`.
- Sandbox shutdown is attempted only after the terminal write succeeds.
- Repeated terminal signals are idempotent and do not corrupt state.
- Public reads stay small and are served from the existing sandbox record.
- If the system cannot prove the stream is terminal, it does not mark shutdown as safe.

## Test Strategy


| Layer       | What                   | How                                                                                                           |
| ----------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| Unit        | Start transition       | Verify `markOpencodeStarted` writes `STARTED`, `opencodeStartedAt`, and clears prior terminal fields          |
| Unit        | Terminal transition    | Verify `setOpencodeTerminalState` writes terminal state, timestamp, reason, and `opencodeShutdownSafe = true` |
| Unit        | Idempotency            | Reapply terminal mutation and assert state remains valid                                                      |
| Integration | Happy path             | Simulate stream start then completion and assert shutdown is called only after terminal persistence           |
| Integration | Failure path           | Simulate monitoring failure and assert durable `FAILED` state before shutdown                                 |
| Integration | Ambiguous interruption | Simulate disconnect without terminal classification and assert shutdown is not marked safe                    |


## Trade-offs


| Chose                                | Over                          | Because                                                |
| ------------------------------------ | ----------------------------- | ------------------------------------------------------ |
| Sandbox-row lifecycle fields         | Dedicated runs table          | There is no current need for history                   |
| Terminal-state persistence only      | Rich stream ingestion         | The product need is shutdown safety, not observability |
| Explicit `opencodeShutdownSafe` flag | Derived-only logic            | It gives callers one durable condition to trust        |
| No message storage                   | Finalized-message persistence | The user explicitly does not need it                   |


## Rollout Plan

First, extend `todoSandboxes` and storage mutations with the lifecycle fields. Next, update the OpenCode setup path to write `STARTED`. Then add monitoring logic that writes a terminal state and only after that calls sandbox shutdown. Finally, expose the lifecycle fields through the existing sandbox query surface.

## Success Metric

Given a `todoId`, the app can answer from Convex alone whether the OpenCode stream never started, is currently active, or has reached a terminal state where sandbox shutdown is safe.

---

Phase: DONE | Waiting for: none