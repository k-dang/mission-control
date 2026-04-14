# Plan: OpenCode PR Creation

> Source PRD: `plans/opencode-pr-creation-prd.md`

## Architectural decisions

Durable decisions that apply across all phases:

- **Workflow**: OpenCode remains the agent that performs code changes, validation, branching, committing, pushing, and PR creation inside the sandbox.
- **Verification boundary**: The application should not trust agent narration alone; PR existence is verified after the run using a more authoritative GitHub or repository signal.
- **Schema**: The durable PR artifact for v1 is a single optional PR URL stored on the todo record.
- **Runtime model**: Existing sandbox and OpenCode lifecycle tracking remain in place and are extended with PR outcome semantics rather than replaced.
- **UI surface**: The task detail experience remains the main user-facing surface for PR visibility.
- **Auth**: GitHub write access is provided through environment-based credentials available to the sandbox/runtime.
- **Failure semantics**: No-op runs do not create PRs, and runs with code changes that fail PR creation or verification are treated as failed outcomes.
- **Scope**: V1 stores only the PR URL and does not add branch metadata, commit metadata, merge tracking, or richer PR history.

---

## Phase 1: Persist PR Outcome

**User stories**: 4, 7, 11, 14, 15, 17

### What to build

Extend the todo domain so a completed OpenCode run can persist its durable PR outcome on the todo itself. This slice should make the backend capable of recording a verified PR URL for successful PR-producing runs and a failed todo outcome when code changes occurred but no PR could be verified.

### Acceptance criteria

- The todo model can store an optional PR URL as part of its durable state.
- Backend write paths can persist the PR URL after a successful verification step.
- Backend write paths can mark the todo as failed when PR creation should have happened but could not be verified.
- The persisted PR outcome lives on the todo rather than on sandbox-only runtime state.

---

## Phase 2: Show PR Link In UI

**User stories**: 7, 8, 13

### What to build

Expose the persisted PR URL through the existing todo detail flow and render it in the task detail panel as a simple clickable link near the current repository and OpenCode links. This slice makes the new durable artifact visible without changing the broader product layout.

### Acceptance criteria

- Todo detail reads include the PR URL when one exists.
- The task detail panel renders a PR link when the todo has a stored PR URL.
- The task detail panel remains unchanged for todos without a PR URL.
- The new link presentation fits into the existing detail panel without adding a new navigation surface.

---

## Phase 3: Teach OpenCode To Deliver A PR

**User stories**: 1, 2, 3, 5, 6, 12, 17

### What to build

Update the OpenCode run contract so the agent is explicitly expected to finish the task by creating a ready-for-review pull request when there are code changes. The slice should preserve the current OpenCode lifecycle while making PR creation part of the end-to-end intended outcome and keeping no-op runs free of unnecessary git or PR actions.

### Acceptance criteria

- The OpenCode task contract explicitly includes validation, branch creation, commit, push, and ready-for-review PR creation.
- The OpenCode contract makes clear that no PR should be opened when no files changed.
- The PR title and body are agent-generated rather than app-templated.
- Existing lifecycle orchestration still works with the expanded PR-producing workflow.

---

## Phase 4: Verify PR And Classify Outcomes

**User stories**: 3, 4, 9, 14, 15

### What to build

Add a post-run verification step that checks whether a real pull request exists and classifies the sandbox outcome accordingly. This slice completes the end-to-end path from agent execution to durable product state by distinguishing no-op runs, successful verified PR runs, and failed PR-producing runs.

### Acceptance criteria

- The backend performs PR verification after the OpenCode run reaches its terminal state.
- A verified PR causes the PR URL to be persisted on the todo.
- A no-op run results in no PR URL and does not create a false failure.
- A run with code changes but no verified PR transitions the todo to a failed outcome.

---

## Phase 5: Harden Auth And Validation

**User stories**: 10, 16, 18

### What to build

Make the GitHub credential requirements explicit in runtime behavior and add focused validation for the critical feature paths. This slice should ensure the system fails clearly when required auth is unavailable and that the main success, no-op, and failure outcomes are covered by targeted tests.

### Acceptance criteria

- Runtime behavior clearly depends on configured GitHub credentials with repository write and PR creation access.
- Missing or unusable GitHub credentials produce a clear failure mode for PR-producing runs.
- Focused tests cover verified PR persistence, no-op handling, and failed PR verification outcomes.
- Validation remains targeted to externally observable behavior and durable state rather than internal implementation details.