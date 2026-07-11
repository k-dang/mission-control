Status: ready-for-agent

# Retryable Attempts

## What to build

Make failed Todo Tasks editable and retryable without changing their historical Attempts. A retry must create a new Attempt from the Todo Task's current text, default the start dialog to the latest Attempt's Run Configuration, and preserve cancellation as an Attempt-level terminal outcome while the Todo Task returns to FAILED.

## Acceptance criteria

- [ ] A Todo Task in FAILED can have its title, description, and repository URL edited, while other terminal and active states remain protected from draft edits.
- [ ] Starting the edited failed Todo Task creates a distinct new Attempt and retains the prior Attempt's task context, Run Configuration, events, and terminal reason unchanged.
- [ ] The retry start interaction defaults to the latest Attempt's Run Configuration and permits the user to choose another supported configuration.
- [ ] A cancelled Attempt remains visible as cancelled in Attempt history and maps the Todo Task to FAILED with a terminal reason; no new board status is added.
- [ ] Mutation and UI-contract tests prove the retry and cancellation behavior without depending on storage implementation details.

## Blocked by

- [01-attempt-backed-opencode-execution](01-attempt-backed-opencode-execution.md)
