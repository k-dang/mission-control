## Problem Statement

Starting a todo task currently uses a fixed OpenCode provider and model. This makes every automated run use the same routing account and model regardless of task complexity, cost tolerance, or desired model behavior. The user needs to choose the provider and main model for each todo task at the moment it moves into progress, without turning provider credentials or model setup into per-task data entry.

## Solution

Add a curated run configuration flow to the todo start transition. When a todo task is moved from TODO to INPROGRESS, the app opens a start dialog that asks the user to select a provider and main model from a hardcoded catalog. Confirming the dialog starts the task with that run configuration. Cancelling leaves the task in TODO.

The run configuration is captured for that automated attempt and stored with the active execution state rather than with the stable todo metadata. The selected model drives OpenCode's main model. OpenCode's small model remains a fixed internal default. Existing historical runs that do not have a recorded run configuration are displayed as "Unknown run configuration."

## User Stories

1. As a task operator, I want to choose a provider when I start a todo task, so that I can route each run through the account or gateway I prefer.
2. As a task operator, I want to choose a model when I start a todo task, so that I can match the model to the expected complexity of the work.
3. As a task operator, I want the start dialog to appear every time a task moves into progress, so that I do not accidentally start a run with the wrong model.
4. As a task operator, I want drag/drop into the in-progress column to open the same start dialog, so that drag/drop and detail-panel starts behave consistently.
5. As a task operator, I want a cancelled start dialog to leave the task in TODO, so that no run begins without an explicit provider/model confirmation.
6. As a task operator, I want the current default provider/model preselected, so that common starts remain fast.
7. As a task operator, I want providers grouped clearly in the model picker, so that I understand which account boundary will run the model.
8. As a task operator, I want each supported provider to expose a curated model choice, so that the start dialog remains constrained to known-good options.
9. As a task operator, I want provider credentials to remain environment-level, so that task creation never exposes or stores secrets.
10. As a task operator, I want the app to use a curated provider/model list, so that I only see choices the app is intended to support.
11. As a task operator, I want the selected provider/model shown on in-progress cards, so that I can scan the board and understand what is running.
12. As a task operator, I want the selected provider/model shown on completed and failed task cards, so that I can review which run configuration produced an outcome.
13. As a task operator, I want the task detail panel to show the run configuration near execution metadata, so that I can inspect a run without relying on the card summary.
14. As a task operator, I want historical tasks without recorded provider/model data to say "Unknown run configuration," so that the UI does not imply false certainty.
15. As a task operator, I want provider/model validation on start, so that unsupported options cannot be sent by a stale or modified client.
16. As a task operator, I want OpenCode to receive the selected provider and main model, so that the actual execution matches the run configuration I confirmed.
17. As a task operator, I want the small model to remain fixed, so that the start dialog stays focused on the main execution model.
18. As a developer, I want provider/model labels and defaults defined in one catalog, so that backend validation and frontend display do not drift.
19. As a developer, I want existing started tasks to keep working after the schema change, so that historical data does not require a migration before deployment.
20. As a developer, I want failures caused by unsupported run configuration values to fail early, so that orchestration errors are easier to diagnose.
21. As a developer, I want the run configuration stored with the active attempt state, so that todo metadata remains separate from execution-specific choices.
22. As a developer, I want the design to leave room for future run history, so that retries or multiple attempts can later move into a dedicated attempt model without changing the user-facing concept.

## Implementation Decisions

- Introduce a **Run Configuration** concept: the provider and main model captured for one automated attempt at a todo task.
- Treat **Provider** as the routing and account boundary, not the company that created the underlying model.
- Use a hardcoded curated catalog as the source of truth for provider labels, model labels, default selection, and supported combinations.
- Initially support Vercel AI Gateway with `moonshotai/kimi-k2.5` and OpenRouter with `moonshotai/kimi-k2.6:free`.
- Keep credentials environment-level and out of task data. The catalog does not need to validate whether corresponding environment variables are present.
- Store the active run configuration with the active execution/sandbox state rather than with todo task metadata.
- Keep the run configuration optional for compatibility with already-started and historical tasks.
- Display missing historical run configuration data as "Unknown run configuration."
- Change the start transition contract so the caller supplies provider and main model.
- Validate the supplied provider/model combination against the curated catalog on the backend.
- Use the selected model only for OpenCode's main model.
- Keep OpenCode's small model fixed as an internal default.
- Generate OpenCode configuration from the selected provider/model and the curated provider definitions.
- Use the same start dialog for status-pill starts and drag/drop starts.
- Keep the task in TODO while the start dialog is open. Only confirming the dialog starts the task and moves it into progress.
- Show the recorded run configuration on in-progress, completed, and failed task cards.
- Show the recorded run configuration in the task detail panel near execution metadata.
- Do not create a dedicated run history table in this phase. The current active execution state is sufficient for one active automated attempt per todo task.

## Testing Decisions

- Tests should cover external behavior and stable contracts, not internal component state or incidental implementation details.
- Test the curated catalog helper behavior, including valid combinations, invalid combinations, default selection, and display labels.
- Test backend start behavior with a valid run configuration, including that the run configuration is recorded with the execution state.
- Test backend start behavior with an unsupported provider/model combination, including early rejection.
- Test compatibility behavior for execution state that lacks run configuration data.
- Test OpenCode config generation if it can be isolated behind a pure helper, including provider-specific model inclusion and selected main model.
- Existing project tests already exercise helper modules for OpenCode stream monitoring, pull request generation, and GitHub behavior; follow that style for pure run configuration helpers.
- UI-level tests for the dialog flow are not required in this PRD unless a future implementation adds a reliable UI testing layer.
- Manual validation should include drag/drop start, status-pill start, cancelling the dialog, confirming with each supported provider, and viewing historical rows with no run configuration.

## Out of Scope

- User-entered provider credentials.
- Environment-variable availability checks for provider display.
- Arbitrary provider/model string entry.
- Selecting or tuning OpenCode's small model.
- Per-user model preferences.
- Persisting draft provider/model preferences on TODO tasks before start.
- Multiple attempts or retry history for a single todo task.
- Migrating historical rows to infer provider/model values.
- Cost estimation, token accounting, or provider quota display.
- Dynamic model discovery from provider APIs.

## Further Notes

The project glossary now defines Todo Task, Run Configuration, Provider, and Sandbox. The key domain boundary is that run configuration belongs to an automated attempt, not to the stable todo task. If the product later supports retries or multiple automated attempts per task, the active execution state can evolve into a dedicated attempt history while preserving the same user-facing language.
