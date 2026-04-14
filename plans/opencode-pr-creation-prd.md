## Problem Statement

Users can already send a todo to OpenCode inside a sandbox and have it work on the repository, but the workflow stops short of the main deliverable the user cares about: a reviewable pull request. Today, the system can run the agent and track its lifecycle, yet the user still has to inspect the sandbox outcome and manually handle branch, commit, push, and PR creation outside the product.

For v1, the user wants the sandbox workflow to feel complete: submit the prompt, let OpenCode make the changes, and finish with a pull request ready for review. If OpenCode does work but cannot successfully produce a PR, the todo should be considered failed rather than silently appearing successful.

## Solution

Extend the OpenCode sandbox workflow so the agent is instructed to complete the full GitHub delivery path: make changes, validate them, create a branch, commit, push, and open exactly one ready-for-review pull request for the todo when there are code changes. The system should not open anything when no files changed.

The application should not rely only on the agent claiming that a PR was created. Instead, after the OpenCode run reaches its terminal state, backend orchestration should verify the resulting PR and persist only the PR URL as the durable user-facing artifact. That PR URL should be stored on the todo and shown in the task detail panel alongside the existing GitHub and OpenCode links.

This v1 treats PR creation as part of the definition of success for the sandbox workflow, while keeping the persisted product surface intentionally small.

## User Stories

1. As a user, I want OpenCode to finish a todo by opening a pull request, so that I receive a reviewable deliverable instead of raw sandbox output.
2. As a user, I want the agent to handle branching, committing, pushing, and PR creation for me, so that I do not have to complete those steps manually.
3. As a user, I want the agent to skip PR creation when no files changed, so that the system does not create empty or misleading pull requests.
4. As a user, I want the todo to fail if code changes were made but a PR was not successfully created, so that incomplete automation is visible immediately.
5. As a user, I want OpenCode to generate the PR title and body, so that the change summary matches the work the agent actually performed.
6. As a user, I want pull requests to open as ready for review rather than draft, so that the output is immediately usable.
7. As a user, I want the PR URL stored on the todo, so that the main task record always points to the canonical review artifact.
8. As a user, I want to see the PR URL in the task detail panel, so that I can click straight from the app to the pull request.
9. As a user, I want the app to verify that a PR really exists instead of trusting the agent’s narration, so that the UI reflects actual GitHub state.
10. As a user, I want the system to require explicit GitHub authentication for write operations, so that branch pushes and PR creation are reliable and intentional.
11. As a user, I want the system to avoid storing unnecessary PR metadata in v1, so that the implementation stays focused on the minimal useful outcome.
12. As a user, I want the workflow to work even if the default branch is not predetermined by the app, so that the agent can handle repository conventions flexibly.
13. As a user, I want the todo detail view to remain simple, so that adding PR support does not require a large UI redesign.
14. As an operator, I want the backend to distinguish between no-op runs and failed PR creation, so that failure handling is accurate.
15. As an operator, I want PR verification to happen after the sandbox run, so that persisted PR URLs come from an authoritative source rather than speculative intermediate events.
16. As an operator, I want auth requirements called out clearly in the design, so that deployment failures are easier to prevent.
17. As an operator, I want the workflow to remain compatible with the existing OpenCode lifecycle model, so that PR support can be layered onto the current orchestration rather than replacing it.
18. As a future maintainer, I want a narrow v1 surface area, so that richer PR state and synchronization can be added later without undoing an oversized first implementation.

## Implementation Decisions

- The OpenCode workflow now includes PR creation as the final expected outcome when code changes are present.
- The prompt contract for OpenCode should explicitly instruct the agent to:
- understand the codebase before editing
- make the requested changes
- run relevant validation
- create a branch
- commit the changes
- push the branch
- open exactly one ready-for-review pull request
- output enough information for post-run verification when possible
- The system should not treat agent self-reporting as the sole source of truth for PR existence.
- Backend orchestration should perform a verification step after the OpenCode run to discover the resulting PR URL from GitHub or from repository state in a more authoritative way.
- The durable user-facing artifact for v1 is only the PR URL.
- The PR URL should be stored on the todo record rather than on the sandbox/OpenCode runtime record, because the PR is the lasting product outcome rather than transient execution state.
- The UI read surface for todo details should include the persisted PR URL.
- The task detail panel should show the PR URL as a link near the existing GitHub and OpenCode links.
- If no files changed, the workflow should not create a commit, branch push, or pull request.
- If code changes occurred but PR creation cannot be verified, the todo should transition to `FAILED`.
- Pull requests should be created as ready for review, not draft.
- OpenCode should generate the PR title and body rather than using a fixed app-owned template.
- The app should call out GitHub authentication as an explicit prerequisite for PR creation, with an environment-variable based token carrying repository write and pull-request creation permissions.
- The implementation should preserve the current OpenCode lifecycle tracking and extend it with PR completion semantics rather than replacing the current lifecycle model.
- The design should keep branch naming, exact base branch selection, and repository-specific git details in the agent’s responsibility for v1 rather than codifying app-side branch rules.
- Failure reporting should distinguish between:
- no code changes, which is a non-PR no-op outcome
- OpenCode runtime failure before completing work
- PR creation or PR verification failure after code changes

## Testing Decisions

- Good tests should validate externally observable behavior and durable outcomes rather than implementation details, internal helper structure, or prompt wording minutiae.
- Good tests for this feature should primarily assert whether a PR URL is or is not persisted, whether the todo ends in the expected status, and whether the read/UI surfaces reflect those durable outcomes.
- The modules that should be tested are:
- PR verification and persistence logic
- workflow outcome classification for no-op, success, and failure cases
- task detail read behavior that exposes the PR URL
- task detail UI behavior that renders the PR link when present
- Prior art for testing exists in the current codebase’s focused utility-style tests around OpenCode lifecycle helpers, especially the existing event-classification tests for OpenCode terminal-state detection.
- Similar focused tests should be favored here: small deterministic tests for helper logic and targeted integration-style tests for durable state transitions.
- Useful v1 scenarios to cover include:
- successful run with code changes and verified PR URL persisted on the todo
- successful run with no file changes and no PR URL persisted
- code changes made but PR verification fails, causing the todo to become `FAILED`
- task detail data includes the PR URL when present
- task detail UI renders a clickable PR link only when a PR URL exists

## Out of Scope

- Updating or force-pushing an existing PR from later agent runs.
- Storing PR number, branch name, commit SHA, merge state, or review state.
- Draft PR creation flows.
- App-owned PR title/body templating.
- A branch naming convention enforced by the app.
- Advanced GitHub sync features such as polling for merge status or closed state.
- Generic support for non-GitHub providers.
- Rich audit history for git operations inside the sandbox.
- Resolving authentication interactively inside the app UI.

## Further Notes

- The research direction for v1 should assume that a post-run verification step is more reliable than trusting agent narration alone.
- The feature depends on sandbox GitHub credentials being present and correctly scoped; without them, branch push and PR creation should be expected to fail.
- The design should stay intentionally narrow. If v1 succeeds, future iterations can add richer persisted PR metadata and stronger reconciliation between GitHub state and todo state.

