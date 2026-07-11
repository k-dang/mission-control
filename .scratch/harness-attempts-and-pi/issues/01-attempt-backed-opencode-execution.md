Status: needs-validation

# Attempt-Backed OpenCode Execution

## What to build

Replace the mutable OpenCode-shaped runtime record with durable, app-owned Attempts while keeping a Todo Task's existing OpenCode execution path working end to end. Migrate existing operational data, make the latest Attempt the current projection, attach Attempt Events and tool counts to the real Attempt identity, and move Sandbox provisioning, stream monitoring, terminal outcomes, pull-request handoff, and cleanup to that identity. Apply the shared 30-minute Sandbox budget with lease renewal during monitor slices.

## Acceptance criteria

- [x] Starting a Todo Task creates exactly one active Attempt with its captured Run Configuration; a concurrent start returns that active Attempt and does not create a second execution.
- [x] Legacy runtime records, Attempt Events, and tool-call counts are explicitly deprecated and purged; the Attempt model has no legacy compatibility path.
- [x] An OpenCode Todo Task runs through Sandbox provisioning, streaming events, terminal state, pull-request orchestration, notification, and best-effort cleanup using the app-owned Attempt ID.
- [x] The default board and transmission-log projection show the latest Attempt without requiring a historical-browsing UI.
- [x] An active sandboxed Attempt receives lease renewal up to the 30-minute budget; budget exhaustion records a failed Attempt and failed Todo Task outcome.
- [ ] Contract, OpenCode monitor regression, and live Sandbox smoke tests demonstrate the completed behavior.

## Validation note

Contract and monitor unit tests pass. A live Sandbox smoke has not yet run because
there is no reachable OpenCode server configured for the smoke script.

## Blocked by

None - can start immediately.
