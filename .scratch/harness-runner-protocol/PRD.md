Status: ready-for-agent

# Harness Runner Protocol

## Problem Statement

Automated Attempts at Todo Tasks can only be executed by OpenCode. The orchestration code, storage schema, event pipeline, and PR-creation flow are all written directly against OpenCode's SDK dialect, so a user who wants an Attempt executed by a different agent Harness (Pi, Cursor, a Flue-style harness) has no way to choose one — and the maintainer has no way to add one without rewriting the most fragile orchestration code (the reattaching stream monitor) per SDK shape.

## Solution

Introduce the Harness as a first-class, user-selectable part of the Run Configuration, and put every Harness behind one uniform "runner" — a small process installed inside the Sandbox that exposes a fixed HTTP contract (`health`, `attempt`, `events`, `status`) and emits events already normalized to the persisted todo-event vocabulary. The Convex orchestrator keeps exactly one install/monitor/finalize path, parameterized only by which runner bundle is written into the Sandbox. OpenCode is wrapped by a runner like every other harness. Adding a new Harness then means: write a runner (projector + protocol server), add a catalog entry — and nothing else.

See ADR 0001 (uniform harness runner protocol) and CONTEXT.md for the governing decisions and vocabulary.

## User Stories

1. As a board user, I want to choose which Harness executes an Attempt when I start a Todo Task, so that I can pick the agent best suited to the work.
2. As a board user, I want the Harness choice to constrain the Provider and model options I'm shown, so that I can never submit an invalid combination.
3. As a board user, I want the Run Configuration (harness, provider, model) frozen when the Attempt starts, so that a run is reproducible and its record is trustworthy.
4. As a board user, I want the transmission log to show the same kinds of milestones (steps, tool calls, patches, errors) regardless of which Harness ran the Attempt, so that I don't have to learn a new UI per harness.
5. As a board user, I want past Attempts to display their full Run Configuration including the Harness, so that I can compare harnesses' results.
6. As a board user, I want Attempts recorded before harness selection existed to display as OpenCode runs, so that history stays accurate without any action from me.
7. As a board user, I want an Attempt that produces changes to end with a pull request whose title and body describe the actual diff, no matter which Harness produced the changes, so that review quality doesn't depend on harness choice.
8. As a board user, I want an Attempt that produces no changes to complete without opening an empty pull request, so that the repo isn't polluted.
9. As a board user, I want Attempts that legitimately take longer than ten minutes to keep running instead of dying silently, so that harder tasks can actually finish.
10. As a board user, I want an Attempt that fails — in the harness, the runner, or the sandbox — to mark the Todo Task FAILED with a human-readable reason, so that I know what happened without reading server logs.
11. As a board user, I want a cancelled Attempt distinguished from a failed one in the recorded terminal state, so that the history reflects intent.
12. As a board user, I want the transmission log to have no gaps even though monitoring happens in slices, so that I can trust it as a record of what the agent did.
13. As a maintainer, I want to add a new Harness by writing only a runner and a catalog entry, so that orchestration code never needs to change for harness N+1.
14. As a maintainer, I want one shared contract-test suite that every runner must pass, so that a new runner is proven compatible before it ever touches a sandbox.
15. As a maintainer, I want runner code deployed atomically with the orchestrator code that speaks to it, so that protocol versions can never skew.
16. As a maintainer, I want each harness's heavyweight SDK installed inside the Sandbox at a pinned version, so that runs are reproducible and native-binary SDKs work on the sandbox's platform.
17. As a maintainer, I want the storage schema to speak in harness-neutral terms (Attempt, not opencode), so that the data model doesn't lie once a second harness exists.
18. As an operator, I want each Harness's credentials read from clearly named environment variables with a fail-fast error when one is missing, so that misconfiguration surfaces at Attempt start, not mid-run.
19. As an operator, I want PR metadata generation to use one deployment-level model and credential, so that it works identically for every harness and its cost is predictable.
20. As an operator, I want a sandbox that fails during provisioning to be stopped rather than leaked, so that I don't pay for orphaned VMs.

## Implementation Decisions

- **Domain vocabulary** (recorded in CONTEXT.md): a **Harness** is the agent runtime installed inside a **Sandbox**; an **Attempt** is a single automated execution of a **Todo Task** by one Harness inside one Sandbox; a **Run Configuration** is the harness, provider, and model selection captured for a single Attempt. Vendor-hosted execution outside the Sandbox is not a Harness and is out of scope.
- **Uniform runner protocol** (ADR 0001): every Harness is fronted by a runner process inside the Sandbox exposing `GET /health`, `POST /attempt` (accepts the task prompt, returns an opaque `attemptId`), `GET /events` (SSE), and `GET /status` (reports RUNNING or a terminal state: COMPLETED, FAILED, CANCELLED, with an optional reason). The runner is the only surface the orchestrator talks to; harness-native dialects (session idle detection, SDK event shapes) are the runner's private business.
- **Event normalization at the source**: the runner emits events already shaped as the existing persisted todo-event payload union (session status, step start/finish, tool, patch, compaction, subtask, todo-updated, error), each with the existing idempotency `eventKey` plus a monotonic sequence ID. The existing OpenCode event projector moves, essentially verbatim, into the OpenCode runner; other runners implement their own projector to the same union, emitting whichever subset applies.
- **Resumable stream**: the runner buffers emitted events and honors `Last-Event-ID` on reconnect, which eliminates today's between-slice event loss. The orchestrator's slice monitor stays: consume the SSE stream for a bounded slice, reschedule itself with the last-seen sequence ID, and fall back to `GET /status` at each slice boundary for terminal detection.
- **One generic monitor**: the OpenCode-specific stream monitor is replaced by a harness-agnostic monitor written against a structural runner-client type. Its slice/retry/terminal-state semantics are unchanged from today's behavior.
- **Run Configuration gains `harnessId`**: the provider/model catalog becomes a harness-rooted tree (harness → providers → models), extending the existing `as const satisfies` catalog idiom, with parse/validate walking the tree. A stored Run Configuration missing `harnessId` parses as the OpenCode harness (historically true for all existing rows — no backfill needed).
- **Per-harness credentials** extend the existing provider→env-var map idiom to be harness-scoped (e.g. OpenCode's providers keep their current vars; Pi uses direct model-vendor keys; Cursor uses its own API key). Missing keys fail fast at Attempt start.
- **PR metadata generation moves orchestrator-side**: title/body are generated from the staged diff by a direct model call using one deployment-level metadata model and the AI Gateway credential the deployment already holds. The per-provider PR-metadata-model map is deleted from the Run Configuration catalog. The existing fallback (todo title/description) is retained. The rest of the PR pipeline (staging, branch, push, GitHub API) is already harness-neutral and is unchanged.
- **Runner packaging**: runners live in the repo as one package per harness plus a shared protocol package. A build step bundles each runner's orchestration code into a single JS artifact shipped inside the Convex deployment and written into the Sandbox at Attempt start. Heavy harness dependencies (OpenCode CLI via its install script, Pi and Cursor SDK packages — the latter has platform-native binaries) are installed *inside* the Sandbox by the runner's install step, version-pinned.
- **Storage rename** (widen–migrate–narrow, using the Convex migrations component): the sandbox row's `opencode` state object becomes `attempt`; the events table's `opencodeSessionId` becomes `attemptId`; the tool-call-counts table drops its OpenCode prefix. Ships as the first PR, before any behavior change.
- **Ride-along fixes** in the protocol PR, since those paths are being rewritten anyway: the monitor extends the sandbox's lifetime each slice up to a configurable maximum Attempt duration (fixing the silent ten-minute kill), and sandbox provisioning stops the sandbox on any failure after creation (fixing the leak window).
- **Delivery sequence**: PR 1 = storage rename (mechanical, no behavior change). PR 2 = protocol package + OpenCode runner at behavior parity + generic monitor + orchestrator-side PR metadata + `harnessId` in Run Configuration (UI shows one harness) + ride-along fixes, verified by a real end-to-end run. PR 3 = Pi runner as harness #2 (chosen because its embedded-SDK shape is the hard case the design exists for, and its credentials are trivial to obtain). Cursor and Flue-style harnesses follow later as runner + catalog additions.
- **Deliberately deferred**: runner endpoint authentication. The runner is public and unauthenticated, matching today's exposure; a per-Attempt bearer token was considered and postponed as a separate security effort (recorded in ADR 0001).

## Testing Decisions

- Tests exercise external behavior at seams, never implementation details. The refactor introduces exactly **one new seam**: the runner protocol contract.
- **Contract-test suite (primary)**: a single shared suite written against the structural runner-client interface, run two ways — against a fake in-memory runner (fast coverage of the generic monitor's slice, retry, resume, and terminal-state logic) and against each real runner started in-process (proving every runner speaks the same dialect). A new runner ships by passing this existing suite. Prior art: the current stream-monitor tests, which already drive the monitor through a structural fake client with scripted event streams.
- **Projector tests (existing pattern)**: each runner's harness-events → todo-event-payload projector is a pure class tested with scripted native events, exactly as the OpenCode projector is tested today; those tests move with the code.
- **Catalog/parse tests (existing pattern)**: harness-rooted catalog validation, legacy-row defaulting to the OpenCode harness, and unsupported-combination rejection extend the existing run-configuration test file's style.
- **Mutation tests (existing pattern)**: the rename migration and the terminal-state mutations are covered with convex-test, per the existing todo-runs tests.
- **Real-sandbox behavior is not unit-tested**: Vercel sandbox provisioning, actual harness installs, and end-to-end Attempts are verified empirically with a real run before each PR merges, with the existing OpenCode stream smoke script as the precedent for scripted probes.

## Out of Scope

- Execution outside the Sandbox (e.g. Cursor's cloud mode, any vendor-hosted VM). By definition not a Harness.
- Runner endpoint authentication and network-policy hardening (consciously deferred; see ADR 0001).
- Cursor and Flue runners (follow-ups after the Pi runner proves the embedded-SDK path).
- Sandbox snapshotting to pre-bake harness installs (a later startup-time optimization).
- Any transmission-log UI redesign beyond rendering the existing event kinds; any board/lifecycle changes beyond the harness selector in run configuration.
- Multi-Attempt history per Todo Task (the current one-active-Attempt model is unchanged).

## Further Notes

- The event payload union is already harness-neutral; harness-specific kinds simply won't be emitted by runners whose harnesses lack the concept. New kinds may be added to the union later without breaking existing runners (they just never emit them).
- The protocol port reuses the single exposed sandbox port; harness-internal servers (like OpenCode's) need not be exposed once the runner fronts them.
- CONTEXT.md's glossary and ADR 0001 were written during the design session that produced this PRD; treat them as the source of truth for vocabulary and the protocol decision respectively.
