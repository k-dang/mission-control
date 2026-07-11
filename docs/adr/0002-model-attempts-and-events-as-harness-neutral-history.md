# Model attempts and events as harness-neutral history

Before adding Pi, the existing OpenCode workflow should move from the legacy `todoSandboxes` shape to a harness-neutral `todoAttempts` model. An Attempt is one execution of a Todo Task, so the data model should keep one row per Attempt, not one mutable current-sandbox row per Todo Task. The product still enforces at most one active Attempt per Todo Task, and the Todo Task status summarizes the active Attempt when one exists, otherwise the latest terminal Attempt.

Attempt Events belong to the app-owned Attempt row, not to upstream session identifiers from OpenCode, Pi, or any future Harness. Each Attempt may hold one opaque Harness Run ID, used only by its Harness adapter to reconnect to its upstream execution; for example, an OpenCode session ID or Pi Sandbox command ID. Run Configuration provider identifiers are scoped to the selected Harness so each Harness can store the provider ID it must pass to its upstream tool, even when two Harnesses show the same user-facing provider label.

## Considered Options

- **Keep `todoSandboxes` as the current runtime row** - rejected because it keeps OpenCode's initial implementation detail at the center of the model.
- **Rename to `todoAttempts` but keep one row per Todo Task** - rejected because the name would imply history while preserving the old cardinality.
- **Add Pi before the OpenCode refactor** - rejected because it would force the second Harness through compatibility code shaped by the first Harness.

## Consequences

This is an explicit breaking replacement. Legacy runtime rows, events, and counters are deprecated and purged before deploying the strict Attempt-only schema; no compatibility storage, fallback reads, or backfill are retained.

The "one active Attempt per Todo Task" invariant is enforced in the `todoRuns.start` mutation transaction. The Todo Task owns an optional `activeAttemptId` slot: start returns the referenced Attempt when the slot is occupied, otherwise it inserts a new Attempt and assigns the slot while patching the Todo Task to `INPROGRESS` in the same transaction. Terminal transitions clear the slot transactionally. This keeps active ownership authoritative in one place instead of mirroring it with a boolean on every Attempt.

The initial UI after the refactor should keep current behavior by showing the latest Attempt for a Todo Task by default. Historical Attempt browsing can be added after the storage model exists.

A failed Todo Task can be edited before starting a new Attempt. Retry captures a new Attempt with the updated task text instead of reusing the failed Attempt's original prompt.

When retrying a failed Todo Task, the start dialog should default to the latest Attempt's Run Configuration rather than the global default, while still allowing the operator to choose a different Harness, Provider, or model.

Cancelled Attempts remain Attempt-level terminal outcomes and map the Todo Task back to `FAILED` with a terminal reason. The board does not get a separate cancelled status for now.

Sandboxed Harnesses share a 30-minute total Attempt budget. Their monitor slices extend the active Sandbox lease as needed; exhausting that budget ends the Attempt as failed. This replaces the existing fixed sandbox timeout so Pi and OpenCode follow the same execution policy.

After pull-request orchestration has recorded the final Todo Task outcome, the system stops the Sandbox for every sandboxed Attempt as best-effort cleanup. Cleanup failure does not alter the already-recorded terminal outcome.
