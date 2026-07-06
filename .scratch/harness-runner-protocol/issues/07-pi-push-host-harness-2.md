Status: wontfix

# Pi push host (harness #2)

## Parent

.scratch/harness-runner-protocol/PRD.md

## What to build

The first push-transport Harness (ADR 0001), proving the embedded-SDK path the design exists for. A small bespoke host script is written into the Sandbox at Attempt start and launched detached: it installs the pinned Pi SDK, hosts the agent session in-process, projects Pi's native events (`text_delta`, `tool_execution_*`, `agent_end`, …) into the normalized event vocabulary, and POSTs event batches, heartbeats, and the terminal report to the ingestion endpoint using the per-Attempt token. Add Pi to the harness catalog with its providers/models and credential env mapping (direct model-vendor keys) so it appears as a second option in the harness selector. No inbound port is exposed for Pi Attempts. No orchestration code changes — that is the point.

## Acceptance criteria

- [ ] The same Todo Task can be run under Pi via the harness selector, producing a comparable transmission log and, when changes exist, a PR
- [ ] The Pi host passes the ingestion contract (projector + push loop exercised against a fake ingestion target); ingestion-side code is unchanged
- [ ] Pi's catalog entry constrains providers/models correctly and missing credentials fail fast at Attempt start with a clear error
- [ ] The Pi projector is unit-tested with scripted native events, mirroring the OpenCode projector's tests
- [ ] Failure and cancellation in a Pi Attempt map to FAILED/CANCELLED with reasons; a crashed/silent host is caught by the watchdog
- [ ] Verified with a real end-to-end Pi Attempt
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass

## Blocked by

- .scratch/harness-runner-protocol/issues/02-harness-selection-in-run-configuration.md
- .scratch/harness-runner-protocol/issues/05-attempt-event-ingestion-and-watchdog.md

## Comments

- Cancelled with the transport deferral (ADR 0001): no second harness is being implemented now. When Pi (or any harness #2) is concretely prioritized, design its integration then — the entity model is already generic, and this issue plus ADR 0001's considered options are the starting context.
