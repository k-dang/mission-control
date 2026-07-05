Status: ready-for-agent

# Pi runner (harness #2)

## Parent

.scratch/harness-runner-protocol/PRD.md

## What to build

Prove the protocol with the hard case it was designed for: an embedded-SDK Harness. Build the Pi runner — it installs the pinned Pi package inside the Sandbox, hosts the SDK's agent session in-process, projects Pi's native events (`text_delta`, `tool_execution_*`, `agent_end`, …) into the normalized envelope, and reports terminal state through the protocol. Add Pi to the harness catalog with its providers/models and credential env mapping (direct model-vendor keys), so it appears as a second option in the harness selector. No orchestration code changes — that is the point.

## Acceptance criteria

- [ ] The same Todo Task can be run under Pi via the harness selector, producing a comparable transmission log and, when changes exist, a PR
- [ ] The shared contract-test suite passes against the Pi runner unchanged — no suite modifications, no orchestrator changes
- [ ] Pi's catalog entry constrains providers/models correctly and missing credentials fail fast at Attempt start with a clear error
- [ ] The Pi projector is unit-tested with scripted native events, mirroring the OpenCode projector's tests
- [ ] Failure and cancellation in a Pi Attempt map to FAILED/CANCELLED with reasons, same as OpenCode
- [ ] Verified with a real end-to-end Pi Attempt
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass

## Blocked by

- .scratch/harness-runner-protocol/issues/02-harness-selection-in-run-configuration.md
- .scratch/harness-runner-protocol/issues/05-opencode-runner-parity-generic-monitor.md
