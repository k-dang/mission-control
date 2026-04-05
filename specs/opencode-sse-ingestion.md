# OpenCode SSE Ingestion — Implementation Spec

**Status:** Draft
**Type:** Feature plan
**Effort:** L
**Date:** 2026-04-05

## Problem Statement
**Who:** Developers using this app to send a todo into the sandboxed OpenCode workflow.

**What:** The current OpenCode integration starts a session and submits a prompt, but it does not define how streamed run progress should be represented inside Convex. Without that layer, the app has no durable, reactive view of run state beyond coarse todo status and sandbox metadata.

**Why it matters:** The product needs a stable way to show execution progress, final outputs, and failures without depending on a direct browser connection to the upstream stream. It also needs to stay aligned with Convex best practices around actions, mutations, bounded reads, and reactive queries.

**Evidence:** The current implementation in [convex/opencode.ts](/Users/kevin/Documents/dev/convex-todo-app/convex/opencode.ts) starts OpenCode and submits a prompt, while [convex/sandboxStorage.ts](/Users/kevin/Documents/dev/convex-todo-app/convex/sandboxStorage.ts) only stores sandbox metadata plus a coarse failure path. There is no durable run model today.

## Proposed Solution
Extend the existing OpenCode integration so Convex ingests only the important semantic events from the OpenCode SDK stream and converts them into durable application state. The upstream SSE stream remains an implementation detail of an internal action. Convex becomes the source of truth for run progress, final assistant output, and failure status.

The design should remain intentionally small. Instead of storing raw SSE frames or every chunk, the ingestion path should persist only state transitions that matter to the UI and to recovery logic. Examples include run lifecycle changes, finalized assistant messages, meaningful phase transitions, and terminal errors. This keeps the model aligned with Convex guidance: actions perform external I/O, mutations own database writes, and clients subscribe to normal reactive queries.

The initial implementation should optimize for clarity and operational safety over perfect fidelity. The goal is not to mirror the transport protocol. The goal is to provide a stable, queryable run model that survives reconnects, minimizes write amplification, and leaves room for later refinement if the UI needs richer tool-step visibility.

## Scope & Deliverables
| Deliverable | Effort | Depends On |
|-------------|--------|------------|
| Add a durable OpenCode run model in Convex schema | M | - |
| Add internal storage mutations and queries for run/message state | M | Run model |
| Update OpenCode action flow to ingest important stream events into Convex | M | Storage API |
| Add public read queries for todo-linked OpenCode progress | S | Storage API |
| Document assumptions, non-goals, and rollout behavior | S | - |

## Non-Goals
- Persisting every raw SSE event or every token chunk from OpenCode.
- Rebuilding a generic event-sourcing system for all agent providers.
- Exposing the upstream SSE stream directly to the browser as the main product architecture.
- Adding detailed tool call tracking in the first pass unless the UI proves it is necessary.
- Solving cancellation, resume-after-process-crash, or multi-run concurrency beyond basic safeguards.

## Recommendation
Adopt a small, task-oriented state model based on `todoId` and the current sandbox flow rather than a provider-agnostic event log. This is a better fit for the current repo because the app already revolves around todos and sandbox execution, and the existing Convex code is still relatively compact.

The first version should store two durable concepts:

- `opencodeRuns`: one row per execution attempt for a todo
- `opencodeMessages`: finalized or coarse-grained assistant/user/system messages worth displaying

This is the narrowest model that still supports a useful UI, durable recovery, and future expansion. Tool calls and more detailed step tracking should be treated as follow-on work, not part of the baseline spec.

## Data Model
The new model should add a dedicated run table and a message table.

`opencodeRuns` should capture:

- the owning `todoId`
- the upstream `sessionId`
- a run status such as queued, running, completed, failed, or cancelled
- a coarse `phase` string for user-visible progress
- an optional last processed upstream event id for dedupe or resume logic
- timestamps for start and completion
- an optional error message

`opencodeMessages` should capture:

- the owning `runId`
- the owning `todoId`
- message role such as user, assistant, or system
- an optional provider message id for idempotency
- the persisted message content
- a coarse status such as streaming, completed, or failed
- timestamps for creation and completion

The existing `todoSandboxes` table should remain focused on sandbox identity and OpenCode service URL metadata. It should not become the general storage location for run state.

## Interface Contract
The internal ingestion contract should follow these rules:

- The OpenCode stream is consumed from an `internalAction`.
- That action must not use `ctx.db` directly.
- All durable writes happen through `internalMutation`s.
- Any reads needed for configuration or current state should happen through `internalQuery`s.

The public read contract should stay small:

- query current OpenCode run by `todoId`
- query recent OpenCode messages by `todoId`

The internal write contract should cover:

- create run
- mark run started
- update run phase
- finalize run success
- finalize run failure
- upsert or finalize assistant message

## Event Mapping
The ingestion layer should translate upstream stream traffic into a smaller internal event model.

Persist these categories:

- run created or started
- run phase changed in a way the user should see
- assistant message finalized
- terminal failure
- terminal completion

Do not persist these categories by default:

- token-level deltas
- heartbeat or keepalive frames
- duplicate provider events
- transport-only metadata with no user or operational value

If live partial assistant output is required, it should use coarse periodic flushes rather than one write per token. The default assumption for the first version is that finalized message content is enough.

## Alternatives Considered
| Option | Pros | Cons | Why Not |
|--------|------|------|---------|
| Store every SSE frame | Maximum fidelity | High write volume, poor fit for Convex reactive patterns, expensive to query | Overbuilt for current needs |
| Proxy upstream SSE directly to browser | Simplest transport path | Weak durability, harder recovery, bypasses Convex as source of truth | Conflicts with desired architecture |
| Store only todo status updates | Very small implementation | Loses message history and meaningful execution progress | Too coarse to power a useful UI |
| Store run plus finalized messages | Good UX signal, bounded writes, aligns with current repo | Less detailed than a full event log | Recommended |

## Acceptance Criteria
- [ ] Starting an OpenCode run creates a durable run record linked to the todo.
- [ ] Important lifecycle changes are visible through Convex queries without direct access to the upstream stream.
- [ ] Final assistant output can be loaded reactively from Convex after the run completes.
- [ ] Stream ingestion does not persist raw token-by-token transport chatter by default.
- [ ] All database access remains in queries or mutations, not directly inside the action.
- [ ] New queries use indexes and return bounded result sets.
- [ ] Failure states are persisted in a way the UI can display and the existing todo flow can react to.

## Test Strategy
| Layer | What | How |
|-------|------|-----|
| Unit | Event mapping from upstream stream events into internal semantic events | Test mapper logic with representative provider payloads |
| Unit | Idempotency and duplicate suppression | Test repeated provider ids and last-event handling |
| Integration | OpenCode action writes expected run and message state | Use Convex tests around internal mutations and ingestion helpers |
| Integration | Failure path updates run and todo state correctly | Simulate upstream error and assert terminal state |

## Risks & Mitigations
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Upstream event taxonomy differs from assumptions | Medium | Medium | Keep provider mapping isolated in one translation layer and validate against SDK docs before implementation |
| Partial-output UX later requires finer granularity | Medium | Medium | Start with finalized messages and coarse phase updates; add buffered partial flushes only if the UI needs them |
| Duplicate or replayed provider events create inconsistent state | Medium | High | Use provider ids and last-event checkpoints for idempotent writes |
| Scope creep into full workflow observability | High | Medium | Keep tool-call and deep step tracking out of the first version |

## Trade-offs Made
| Chose | Over | Because |
|-------|------|---------|
| Durable semantic state | Raw SSE persistence | The UI needs stable state, not transport replay |
| Todo-scoped run model | Generic provider event platform | The repo is small and already organized around todo execution |
| Finalized messages first | Token-level live streaming | Lower write volume and better alignment with Convex best practices |
| Minimal public queries | Broad public API surface | Keeps the contract stable and reduces accidental coupling |

## Rollout Plan
Start with a schema and storage API that can support one active run per todo. Then update the existing OpenCode action path to create a run and persist a small set of semantic state transitions. Once the backend contract is stable, expose query endpoints for the frontend to consume. Only after that should the UI be expanded to show richer run progress.

This ordering reduces risk because it validates the durable state model before the app starts depending on it. It also keeps the first slice vertical: a user can trigger a todo run and see durable progress in the app without requiring full event fidelity.

## Open Questions
- [ ] Should the product allow more than one historical OpenCode run per todo, or should a new run replace the old visible run by default? → Owner: Product/implementation
- [ ] Does the first UI need partial assistant output, or is finalized content sufficient? → Owner: Product/implementation
- [ ] Should terminal run completion automatically transition the todo to `COMPLETED`, or should that remain a separate business decision? → Owner: Product/implementation

## Success Metrics
- The app can render current OpenCode progress from Convex queries alone.
- The backend no longer depends on storing transport-level SSE chatter for observability.
- A failed OpenCode execution leaves behind enough durable state for debugging and user messaging.
- The schema and query surface remain small enough to explain in one screen of documentation.

## Discovery
- Explored: existing OpenCode action flow, sandbox metadata storage, and current Convex schema.
- Key findings: current integration starts OpenCode and submits prompts, but has no durable run model; existing storage is sandbox-oriented, not run-oriented; the repo already follows a todo-centric workflow.

## Recommendation Summary
Implement a minimal Convex-backed OpenCode run model that ingests only important semantic events from the upstream stream. Start with run state and finalized messages. Exclude raw SSE persistence, token-by-token writes, and generic event-log ambitions from the first pass.

---
Phase: DONE | Waiting for: none
