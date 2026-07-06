Status: ready-for-agent

# Harness Runner Protocol

## Problem Statement

Automated Attempts at Todo Tasks can only be executed by OpenCode. The orchestration code, storage schema, event pipeline, and PR-creation flow are all written directly against OpenCode's SDK dialect, so a user who wants an Attempt executed by a different agent Harness (Pi, Cursor, a Flue-style harness) has no way to choose one — and the maintainer has no way to add one without rewriting the most fragile orchestration code (the reattaching stream monitor) per SDK shape.

## Solution

Introduce the Harness as a first-class part of the Run Configuration and make the **entity model** harness-neutral — the Attempt vocabulary, the persisted todo-event payload union, terminal semantics, and a harness-rooted configuration catalog — while deliberately building **no cross-harness transport abstraction**. OpenCode keeps its native integration unchanged. When a second Harness is concretely prioritized, its transport, monitoring, and execution environment are designed then, against entities that are already generic.

See ADR 0001 (defer harness transport, keep the Attempt model generic) and CONTEXT.md for the governing decisions and vocabulary.

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

- **Domain vocabulary** (recorded in CONTEXT.md): a **Harness** is the agent runtime that carries out an **Attempt**; an **Attempt** is a single automated execution of a **Todo Task** by one Harness, which may use a **Sandbox** as its execution environment; a **Run Configuration** is the harness, provider, and model selection captured for a single Attempt. Where a Harness executes is decided per harness when it is implemented.
- **Transport deferred** (ADR 0001): no cross-harness protocol, ingestion endpoint, runner, or host machinery is built. OpenCode keeps its native integration (server + SSE slice monitor + orchestrator-side projector) unchanged, and OpenCode-specific code is allowed to stay OpenCode-shaped — no speculative generalization. Two uniform transport designs (pull runner protocol, push ingestion + watchdog) were fully designed and shelved as premature; ADR 0001's considered options record both.
- **Harness-neutral entity model is the deliverable**: the persisted todo-event payload union (session status, step start/finish, tool, patch, compaction, subtask, todo-updated, error) is the vocabulary any future integration projects into; terminal semantics (COMPLETED, FAILED, CANCELLED with reason) and the Attempt-vocabulary storage are generic already.
- **Run Configuration gains `harnessId`**: the provider/model catalog becomes a harness-rooted tree (harness → providers → models), extending the existing `as const satisfies` catalog idiom, with parse/validate walking the tree. A stored Run Configuration missing `harnessId` parses as the OpenCode harness (historically true for all existing rows — no backfill needed).
- **Per-harness credentials** extend the existing provider→env-var map idiom to be harness-scoped (e.g. OpenCode's providers keep their current vars; Pi uses direct model-vendor keys; Cursor uses its own API key). Missing keys fail fast at Attempt start.
- **PR metadata generation moves orchestrator-side**: title/body are generated from the staged diff by a direct model call using one deployment-level metadata model and the AI Gateway credential the deployment already holds. The per-provider PR-metadata-model map is deleted from the Run Configuration catalog. The existing fallback (todo title/description) is retained. The rest of the PR pipeline (staging, branch, push, GitHub API) is already harness-neutral and is unchanged.
- **Storage rename** (widen–migrate–narrow, using the Convex migrations component): the sandbox row's `opencode` state object becomes `attempt`; the events table's `opencodeSessionId` becomes `attemptId`; the tool-call-counts table drops its OpenCode prefix. Ships as the first PR, before any behavior change.
- **Lifecycle fixes**: the OpenCode monitor extends the sandbox's lifetime each slice up to a configurable maximum Attempt duration, fixing the silent ten-minute kill; sandbox provisioning stops the sandbox on any failure after creation, fixing the leak window.
- **Delivery sequence**: storage rename, orchestrator-side PR metadata, and harness selection have landed. Remaining: sandbox lifecycle hardening. Multi-harness implementation is deferred entirely (ADR 0001).
- **Security posture**: the OpenCode server's public unauthenticated exposure is unchanged and remains a consciously deferred item (recorded in ADR 0001).

## Testing Decisions

- Tests exercise external behavior at seams, never implementation details. With transport deferred, **no new seams are introduced** — the existing ones cover the delivered scope: the structural fake client for the stream monitor, the pure OpenCode projector, catalog functions, and convex-test for mutations.
- **Catalog/parse tests (existing pattern)**: harness-rooted catalog validation, legacy-row defaulting to the OpenCode harness, and unsupported-combination rejection extend the existing run-configuration test file's style.
- **Mutation tests (existing pattern)**: the rename migration and the terminal-state mutations are covered with convex-test, per the existing todo-runs tests.
- **Real-sandbox behavior is not unit-tested**: Vercel sandbox provisioning, actual harness installs, and end-to-end Attempts are verified empirically with a real run before each PR merges, with the existing OpenCode stream smoke script as the precedent for scripted probes.

## Out of Scope

- Implementing any second Harness (Pi, Cursor, Flue-style) and, with it, any cross-harness transport abstraction — both a uniform pull runner protocol and a uniform push ingestion contract were designed and shelved as premature (see ADR 0001). Each harness's integration, including where it executes, is designed when it is concretely prioritized.
- Authentication of the OpenCode server's public endpoint and network-policy hardening (consciously deferred; see ADR 0001).
- Sandbox snapshotting to pre-bake harness installs (a later startup-time optimization).
- Any transmission-log UI redesign beyond rendering the existing event kinds; any board/lifecycle changes beyond the harness selector in run configuration.
- Multi-Attempt history per Todo Task (the current one-active-Attempt model is unchanged).

## Further Notes

- The event payload union is already harness-neutral; a future harness integration projects its native events into that union, emitting whichever subset applies. New kinds may be added later without breaking existing integrations.
- CONTEXT.md's glossary and ADR 0001 were written during the design sessions that produced this PRD; treat them as the source of truth for vocabulary and the deferral decision respectively.

## Comments

- Revised after the delivery-skeleton work landed: the uniform *pull* runner protocol was replaced by a uniform *ingestion* contract with per-harness transport. OpenCode's native path retained; embedded harnesses were to push events to Convex.
- Revised again after harness selection landed: the ingestion contract was also shelved — harnesses are too varied to standardize transport before a concrete second harness is prioritized (ADR 0001 now records the deferral, with both shelved designs as considered options). Surviving scope: the harness-neutral entity model (delivered) and sandbox lifecycle hardening (open). User stories about running non-OpenCode harnesses are deferred with the transport work.
