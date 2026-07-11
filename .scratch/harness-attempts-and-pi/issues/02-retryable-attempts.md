Status: needs-validation

# Retryable Attempts

## What to build

Make failed Todo Tasks editable and retryable without changing their historical Attempts. A retry must create a new Attempt from the Todo Task's current text, default the start dialog to the latest Attempt's Run Configuration, and preserve cancellation as an Attempt-level terminal outcome while the Todo Task returns to FAILED.

## Acceptance criteria

- [x] A Todo Task in FAILED can have its title, description, and repository URL edited, while other terminal and active states remain protected from draft edits.
- [x] Starting the edited failed Todo Task creates a distinct new Attempt and retains the prior Attempt's task context, Run Configuration, events, and terminal reason unchanged.
- [x] The retry start interaction defaults to the latest Attempt's Run Configuration and permits the user to choose another supported configuration.
- [x] A cancelled Attempt remains visible as cancelled in Attempt history and maps the Todo Task to FAILED with a terminal reason; no new board status is added.
- [x] Mutation and UI-contract tests prove the retry and cancellation behavior without depending on storage implementation details.

## Validation note

All mechanics already existed from issue 01; this issue landed as contract-test
coverage only (convex/todoRuns.test.ts). The start-dialog default is proven at the
query seam (`todoAttempts.getLatestForTodo`) the UI reads from — the repo has no
component-test harness, so the React wiring itself is untested.

## Blocked by

- [01-attempt-backed-opencode-execution](01-attempt-backed-opencode-execution.md)
