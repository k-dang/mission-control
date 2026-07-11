Status: ready-for-agent

# Harness Attempts and Pi

## Problem Statement

Todo automation is represented by one mutable OpenCode-shaped runtime row per Todo Task. Retries overwrite the prior execution, Attempt Events are tied to upstream session identifiers, and the storage model makes any second Harness an invasive change. Users therefore cannot choose Pi, and maintainers cannot safely add it without first making Attempt history, lifecycle, event identity, Sandbox ownership, and Run Configuration genuinely harness-neutral.

## Solution

Deliver one harness-neutral Attempt foundation and add Pi as the second sandboxed Harness on top of it. Every execution is a durable Attempt with an app-owned event history and a captured Run Configuration. OpenCode moves onto the same model without changing its user-visible behavior. Pi then runs as a detached JSON-mode CLI command in the existing Sandbox, is monitored in bounded slices, projects only normalized milestones, and uses the existing pull-request delivery flow. The start dialog exposes only live-smoked, credential-available Pi provider/model entries.

## User Stories

1. As a board user, I want each execution of a Todo Task recorded as a separate Attempt, so that retries do not overwrite history.
2. As a board user, I want at most one active Attempt per Todo Task, so that two agents cannot work on the same task concurrently.
3. As a board user, I want board status to summarize the active or latest terminal Attempt, so that it remains easy to scan.
4. As a board user, I want the latest Attempt displayed by default, so that the current workflow stays familiar.
5. As a board user, I want a failed Todo Task to become editable and retriable, so that I can correct the task and try again.
6. As a board user, I want retry to create a new Attempt with the current task text and a preselected latest Run Configuration, so that history remains accurate and retry is efficient.
7. As a board user, I want cancelled Attempts retained as cancelled while the board returns the Todo Task to FAILED, so that no extra board state is needed.
8. As a board user, I want transmission-log events attached to the app-owned Attempt, so that history remains valid across Harnesses.
9. As a board user, I want a completed Harness Attempt to enter the same pull-request workflow regardless of Harness, so that delivery is consistent.
10. As a board user, I want Pi shown as a Harness only when a usable Pi configuration exists, so that I never select a dead-end option.
11. As a board user, I want Pi to receive the same Todo Task prompt and workflow expectations as OpenCode, so that changing Harness does not silently change the assignment.
12. As a board user, I want Pi progress rendered as the existing lifecycle and tool milestones, so that I do not need a provider-specific log UI.
13. As a board user, I want full assistant text, tool arguments, and tool results omitted from durable Pi history, so that sensitive and high-volume data is not retained unnecessarily.
14. As a board user, I want Pi failures, timeouts, protocol failures, and post-run pull-request failures to be explained as failed outcomes, so that the board is trustworthy.
15. As a maintainer, I want each Attempt to retain a Run Configuration and opaque Harness Run ID, so that historic executions are attributable and an adapter can reconnect without shared storage knowing upstream transport details.
16. As a maintainer, I want existing OpenCode history migrated to Attempts, so that the refactor preserves operational data.
17. As a maintainer, I want Pi installed at a pinned version inside each Sandbox and upgraded deliberately, so that the adapter contract is reproducible.
18. As a maintainer, I want replayed Pi command logs to be idempotent, so that monitor handoffs cannot duplicate Attempt Events.
19. As an operator, I want sandboxed Attempts to use one 30-minute bounded lifetime and terminal cleanup, so that longer work can finish without leaked compute or credentials.
20. As an operator, I want Pi credentials resolved from deployment configuration and provider/model entries live-smoked before exposure, so that each visible choice is operationally proven.
21. As an operator, I want an unobservable Pi process terminated before failure is finalized when possible, so that it cannot continue changing a repository after the app loses control.

## Implementation Decisions

- Use the domain glossary exactly: an **Attempt** is one execution of a **Todo Task** by a **Harness**; a **Run Configuration** is the captured Harness, Provider, and model selection; a **Harness Run ID** is an opaque adapter-only upstream reconnect identifier; an **Attempt Event** belongs to an app-owned Attempt.
- Replace the legacy one-row-per-Todo-Task runtime storage with one `todoAttempts` row per Attempt. Store lifecycle timestamps/reason, captured Run Configuration when known, optional Sandbox reference, and optional Harness Run ID. Index for Todo Task history and active Attempt lookup.
- Migrate with Convex widen-migrate-narrow. Backfill one Attempt for each legacy runtime row, preserve events and counters where possible, preserve unknown historical Run Configurations as unknown, switch all reads/writes, then remove compatibility storage.
- Enforce one active Attempt transactionally in the start mutation. Starting from `TODO` or `FAILED` creates a new Attempt and marks the Todo Task `INPROGRESS`; an existing active Attempt is returned. Failed Todo Tasks may be edited before retrying.
- Todo Task status is derived from Attempt state. An active Attempt is `INPROGRESS`; otherwise the latest terminal Attempt determines `COMPLETED` or `FAILED`. Attempt-level `CANCELLED` maps to Todo Task `FAILED` with its terminal reason.
- Move OpenCode lifecycle, event append, tool-call counting, query/UI projection, and pull-request handoff to app-owned Attempt IDs while retaining OpenCode's native server and SSE monitor behavior.
- Extract a harness-neutral Todo Task prompt containing title, optional description, repository URL, and expected workflow. Both OpenCode and Pi use it unchanged.
- Sandboxed Harnesses have a shared 30-minute total budget. Monitor slices renew the lease; exhaustion fails the Attempt. After the terminal Todo Task outcome is recorded, use the existing best-effort Sandbox cleanup behavior without letting cleanup failure overwrite that outcome.
- Add Pi as a normal Harness with no feature flag. Its catalog is credential-aware and omits Pi completely when no Pi entry is available. Start-time validation repeats the availability check.
- Initial Pi catalog entries are `openrouter/cohere/north-mini-code:free` and `vercel-ai-gateway/moonshotai/kimi-k2.5`. Provider identifiers are scoped to Pi and use Pi's native values. Run Configurations never contain secrets; integration code resolves and passes credentials as Sandbox command environment variables.
- Install a pinned `@earendil-works/pi-coding-agent` release per Attempt using global npm installation with `--ignore-scripts`. Keep the pin colocated with that install command. Pi runs in the repository directory with JSON mode, ephemeral sessions, and the agreed project-trust override; no thinking level is supplied and default built-in tools remain enabled.
- Start Pi as a detached Sandbox command and save its command identifier as the Attempt's Harness Run ID. Monitor output in bounded scheduled Action slices. Deterministic event keys derived from JSON-line sequence and milestone position make replay idempotent.
- Stdout is Pi's strict JSON-lines protocol. Parse it incrementally, including across command-log chunks. Malformed stdout, lost command stream, nonzero exit, or budget exhaustion fails the Attempt. Stderr is diagnostic only. On early detected failure, best-effort terminate Pi before finalizing failure.
- Project only supported lifecycle and tool milestones into the existing normalized Attempt Event vocabulary. Ignore unknown Pi event types. Persist concise metadata and final errors, never raw Pi JSON, assistant messages, tool arguments, or tool results.
- A zero Pi exit completes the Harness Attempt, after which the shared pull-request flow runs. Pull-request failure is a failed Todo Task outcome after a completed Attempt.
- Extend the existing developer Sandbox smoke pattern. Every curated Pi entry must pass installation, provider/model invocation, JSON projection, repository workflow, and cleanup in a live end-to-end smoke before it appears in the catalog.

## Testing Decisions

- Test externally observable state transitions, catalog visibility, normalized Attempt Events, terminal outcomes, and user-visible retry behavior rather than storage or parser internals.
- Extend the existing Convex mutation contract-test seam for creating an Attempt, excluding concurrent starts, editing/retrying failed Todo Tasks, terminal transitions, cancellation, and preserved historic Attempt data.
- Add migration tests for representative legacy rows with and without Run Configuration, events, counters, and terminal states.
- Extend the existing OpenCode monitor test style to cover the Attempt-backed lifecycle, event deduplication, pull-request handoff, Sandbox renewal, and cleanup.
- Add Pi projector/monitor tests with a fake Sandbox command for split JSON chunks, milestone projection, unknown-event ignoring, deterministic replay, malformed stdout, stderr diagnostics, nonzero exits, timeout, stream loss, and process termination.
- Test Pi catalog availability with configured and absent credentials, including rejection of forged or stale Run Configurations at start.
- Test successful Pi pull-request handoff and post-run pull-request failure through the same orchestrator contract used by OpenCode.
- Run live developer Sandbox smoke tests for both curated Pi entries before enabling them. Run lint, typecheck, Convex development startup, targeted tests, and OpenCode regressions before handoff.

## Out of Scope

- A generic Harness runner/transport protocol, custom Pi SDK host, Pi RPC mode, and `pi -p` as the product path.
- Historical Attempt browsing UI beyond showing the latest Attempt by default.
- Raw Pi event/session retention, Pi session resume, thinking controls, or a custom Pi UI.
- Providers/models beyond the two curated Pi entries.
- Sandbox snapshots, restricted egress, credential brokering, or a changed network-security policy.
- A board status for cancellation.

## Further Notes

- Pi implementation follows the Attempt foundation but both are one feature initiative. Issues may sequence the foundation before the Pi tracer bullet without creating a second product PRD.
- Pi JSON event shape is an adapter contract. Any pinned Pi upgrade requires compatibility tests and a fresh live smoke.
