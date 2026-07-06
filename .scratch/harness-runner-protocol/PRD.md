Status: ready-for-agent

# Harness Runner Protocol

## Problem Statement

Automated Attempts at Todo Tasks can only be executed by OpenCode. The orchestration code, storage schema, event pipeline, and PR-creation flow are all written directly against OpenCode's SDK dialect, so a user who wants an Attempt executed by a different agent Harness (Pi, Cursor, a Flue-style harness) has no way to choose one — and the maintainer has no way to add one without rewriting the most fragile orchestration code (the reattaching stream monitor) per SDK shape.

## Solution

Introduce the Harness as a first-class, user-selectable part of the Run Configuration, and make the **Convex ingestion contract** the uniform abstraction: an HTTP endpoint that accepts Attempt events normalized to the persisted todo-event vocabulary, plus terminal reports, authenticated per Attempt. Transport is deliberately per-harness: OpenCode keeps its existing native pull path (server + SSE slice monitor) unchanged, while embedded-SDK harnesses run a small bespoke host script inside the Sandbox that subscribes to native SDK events and pushes them to the ingestion endpoint. Adding a new Harness then means: write a host script (projector + push loop), add a catalog entry — and nothing else.

See ADR 0001 (uniform ingestion contract, per-harness transport) and CONTEXT.md for the governing decisions and vocabulary.

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
- **Uniform ingestion contract, per-harness transport** (ADR 0001): the shared abstraction is a Convex HTTP ingestion endpoint accepting normalized Attempt events and terminal reports (COMPLETED, FAILED, CANCELLED, with an optional reason), authenticated by a per-Attempt bearer token minted at Attempt start. How events reach that endpoint is each Harness's own business.
- **OpenCode stays on its native pull path**: the existing server, SSE slice monitor, and orchestrator-side projector are untouched. No parity rewrite.
- **Embedded harnesses use push hosts**: each gets a small bespoke in-sandbox host script that installs/hosts its SDK, subscribes to native events, projects them to the existing persisted todo-event payload union (session status, step start/finish, tool, patch, compaction, subtask, todo-updated, error — emitting whichever subset applies), and POSTs them with retries. Delivery is at-least-once; the existing `eventKey` dedupe on event append makes it idempotent, so the transmission log stays gap-free and duplicate-free by construction.
- **Heartbeat watchdog instead of a monitor for push harnesses**: a generic scheduled check fails an Attempt (and stops its Sandbox) when no event or heartbeat has arrived within a threshold; there is no slice monitor, reattachment, buffering, or resume machinery for push harnesses.
- **Run Configuration gains `harnessId`**: the provider/model catalog becomes a harness-rooted tree (harness → providers → models), extending the existing `as const satisfies` catalog idiom, with parse/validate walking the tree. A stored Run Configuration missing `harnessId` parses as the OpenCode harness (historically true for all existing rows — no backfill needed).
- **Per-harness credentials** extend the existing provider→env-var map idiom to be harness-scoped (e.g. OpenCode's providers keep their current vars; Pi uses direct model-vendor keys; Cursor uses its own API key). Missing keys fail fast at Attempt start.
- **PR metadata generation moves orchestrator-side**: title/body are generated from the staged diff by a direct model call using one deployment-level metadata model and the AI Gateway credential the deployment already holds. The per-provider PR-metadata-model map is deleted from the Run Configuration catalog. The existing fallback (todo title/description) is retained. The rest of the PR pipeline (staging, branch, push, GitHub API) is already harness-neutral and is unchanged.
- **Host delivery**: push-host scripts are small (SDK subscribe + fetch), so they ship as source with the Convex deployment and are written into the Sandbox at Attempt start — no bundling pipeline, no publishing, no external fetch. Heavy harness dependencies (Pi and Cursor SDK packages — the latter has platform-native binaries) are installed *inside* the Sandbox at pinned versions by the host's install step, as the OpenCode CLI already is today.
- **Storage rename** (widen–migrate–narrow, using the Convex migrations component): the sandbox row's `opencode` state object becomes `attempt`; the events table's `opencodeSessionId` becomes `attemptId`; the tool-call-counts table drops its OpenCode prefix. Ships as the first PR, before any behavior change.
- **Ride-along fixes**: the sandbox's lifetime is extended periodically (from the OpenCode monitor's slices, and from watchdog ticks for push harnesses) up to a configurable maximum Attempt duration, fixing the silent ten-minute kill; sandbox provisioning stops the sandbox on any failure after creation, fixing the leak window.
- **Delivery sequence**: storage rename and the sandbox delivery skeleton have already landed. Remaining: orchestrator-side PR metadata; `harnessId` in Run Configuration (UI shows one harness); the ingestion endpoint + watchdog; lifecycle hardening; then the Pi push host as harness #2 (chosen because its embedded-SDK shape is the case the design exists for, and its credentials are trivial to obtain). Cursor and Flue-style harnesses follow later as host + catalog additions.
- **Security posture**: the ingestion endpoint requires a per-Attempt bearer token. The OpenCode server's public unauthenticated exposure is unchanged and remains a consciously deferred item (recorded in ADR 0001).

## Testing Decisions

- Tests exercise external behavior at seams, never implementation details. The refactor introduces exactly **one new seam**: the ingestion contract.
- **Ingestion contract suite (primary)**: exercises the HTTP ingestion endpoint's external behavior with convex-test — token acceptance/rejection, event append with `eventKey` dedupe under duplicate delivery, terminal reports driving the finish/fail mutations, and watchdog behavior for silent Attempts. Each push host is proven against the same contract by running its projector + push loop against a fake ingestion target. Prior art: the current stream-monitor tests' structural-fake style, and the existing todo-runs convex-test coverage.
- **Projector tests (existing pattern)**: each push host's harness-events → todo-event-payload projector is a pure module tested with scripted native events, exactly as the OpenCode projector is tested today. The OpenCode projector and monitor tests are untouched, since that path doesn't change.
- **Catalog/parse tests (existing pattern)**: harness-rooted catalog validation, legacy-row defaulting to the OpenCode harness, and unsupported-combination rejection extend the existing run-configuration test file's style.
- **Mutation tests (existing pattern)**: the rename migration and the terminal-state mutations are covered with convex-test, per the existing todo-runs tests.
- **Real-sandbox behavior is not unit-tested**: Vercel sandbox provisioning, actual harness installs, and end-to-end Attempts are verified empirically with a real run before each PR merges, with the existing OpenCode stream smoke script as the precedent for scripted probes.

## Out of Scope

- Execution outside the Sandbox (e.g. Cursor's cloud mode, any vendor-hosted VM). By definition not a Harness.
- Authentication of the OpenCode server's public endpoint and network-policy hardening (consciously deferred; see ADR 0001 — the *ingestion* endpoint does carry a per-Attempt token).
- Cursor and Flue hosts (follow-ups after the Pi host proves the embedded-SDK path).
- Migrating OpenCode from its native pull path onto push ingestion (possible later unification; not needed now).
- Sandbox snapshotting to pre-bake harness installs (a later startup-time optimization).
- Any transmission-log UI redesign beyond rendering the existing event kinds; any board/lifecycle changes beyond the harness selector in run configuration.
- Multi-Attempt history per Todo Task (the current one-active-Attempt model is unchanged).

## Further Notes

- The event payload union is already harness-neutral; harness-specific kinds simply won't be emitted by hosts whose harnesses lack the concept. New kinds may be added to the union later without breaking existing hosts (they just never emit them).
- Push harnesses expose no inbound port at all; only outbound HTTPS from the Sandbox to the Convex deployment is required.
- CONTEXT.md's glossary and ADR 0001 were written during the design sessions that produced this PRD; treat them as the source of truth for vocabulary and the transport decision respectively.

## Comments

- Revised after the delivery-skeleton work landed: the uniform *pull* runner protocol was replaced by a uniform *ingestion* contract with per-harness transport (decision and rejected pull approach both recorded in ADR 0001). OpenCode's native path is retained unchanged; embedded harnesses push events to Convex. Solution, implementation, testing, and scope sections updated accordingly; user stories unchanged.
