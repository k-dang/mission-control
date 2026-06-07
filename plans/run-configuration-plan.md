# Plan: Run Configuration

> Source PRD: `plans/run-configuration-prd.md`

## Architectural Decisions

Durable decisions that apply across all phases:

- **Routes**: Keep the existing board and todo detail routes. Run configuration is selected in the existing start interaction, not on a new page.
- **Schema**: Store run configuration as optional data on the active execution/sandbox state so existing rows remain valid.
- **Key Models**: A **Run Configuration** contains a provider identifier and main model identifier. A **Provider** is the routing/account boundary. A **Todo Task** can have one active automated attempt in this phase.
- **Catalog**: Use a hardcoded curated provider/model catalog as the source of truth for labels, defaults, supported combinations, and validation.
- **Providers**: Initially support Vercel AI Gateway and OpenRouter.
- **Credentials**: Keep provider credentials environment-level. Do not validate environment-variable presence when displaying the catalog.
- **OpenCode**: The selected model controls OpenCode's main model only. The small model remains a fixed internal default.
- **Compatibility**: Existing rows without run configuration display as "Unknown run configuration."
- **Validation**: Validate continuously inside each phase rather than reserving validation for a final phase.

---

## Phase 1: Catalog And Validation Spine

**User Stories**: 6, 7, 8, 10, 15, 18, 20

### What To Build

Create the curated provider/model catalog and helper behavior that the rest of the feature will rely on. The catalog should expose the default run configuration, display labels, provider grouping, and validation for supported provider/model combinations. This phase should be useful before any start-flow UI exists because the backend and frontend can both depend on one stable source of truth.

### Acceptance Criteria

- [x] The catalog includes Vercel AI Gateway and OpenRouter as supported providers.
- [x] The catalog exposes a default provider/model selection.
- [x] The catalog supports one curated model per initial provider.
- [x] Valid provider/model combinations can be recognized.
- [x] Invalid provider/model combinations fail with a clear error path.
- [x] Display labels can be derived for supported provider/model combinations.
- [x] Unit tests cover defaults, valid combinations, invalid combinations, overlapping model identifiers, and display labels.
- [x] Relevant lint/typecheck commands pass for touched code.

---

## Phase 2: Start Transition Captures Run Configuration

**User Stories**: 1, 2, 9, 15, 19, 21, 22

### What To Build

Extend the todo start transition so new starts require a provider/model run configuration, validate that configuration against the curated catalog, and record it with the active execution state. Preserve compatibility with existing execution rows that do not have run configuration data.

### Acceptance Criteria

- [x] Starting a TODO task accepts a run configuration containing provider and main model identifiers.
- [x] Starting with an unsupported provider/model combination fails before orchestration begins.
- [x] A successful start records the run configuration with the active execution state.
- [x] Stable todo metadata does not store provider/model data.
- [x] Existing execution rows without run configuration remain valid.
- [x] Existing queries that return execution state tolerate missing run configuration data.
- [x] Backend tests cover valid start, invalid start, and missing historical run configuration compatibility.
- [x] Relevant lint/typecheck commands pass for touched code.

---

## Phase 3: OpenCode Uses Selected Main Model

**User Stories**: 16, 17, 20

### What To Build

Thread the recorded run configuration into OpenCode setup so the generated OpenCode configuration and initial prompt use the selected provider and main model. Keep the small model fixed as an internal default.

### Acceptance Criteria

- [x] OpenCode configuration includes the selected provider and selected main model.
- [x] The initial OpenCode prompt is submitted with the selected provider and selected main model.
- [x] The small model remains fixed and is not exposed in the run configuration.
- [x] Provider-specific config generation remains deterministic and testable where practical.
- [x] Unsupported or inconsistent run configuration data fails clearly before a misleading run starts.
- [x] Tests cover pure config-generation behavior if it can be isolated cleanly.
- [x] Relevant lint/typecheck commands pass for touched code.

---

## Phase 4: Start Dialog For All Start Paths

**User Stories**: 1, 2, 3, 4, 5, 6, 7, 8, 10

### What To Build

Add a reusable start dialog that appears whenever a task is about to move from TODO to INPROGRESS. The dialog should show provider and model controls based on the curated catalog, preselect the default run configuration, and only start the task after confirmation. Both status-pill starts and drag/drop starts should use the same dialog behavior.

### Acceptance Criteria

- [x] Attempting to start from the detail panel opens the run configuration dialog.
- [x] Dropping a TODO task onto the INPROGRESS column opens the same run configuration dialog.
- [x] Cancelling the dialog leaves the task in TODO.
- [x] Confirming the dialog starts the task with the selected provider/model.
- [x] Provider and model controls are populated from the curated catalog.
- [x] The default provider/model is preselected.
- [x] Model choices are clearly scoped to the selected provider.
- [x] Drag/drop does not visually or persistently move the task to INPROGRESS before confirmation.
- [x] Manual validation covers status-pill start, drag/drop start, cancel behavior, Vercel selection, and OpenRouter selection.
- [x] Relevant lint/typecheck commands pass for touched code.

---

## Phase 5: Run Configuration Visibility

**User Stories**: 11, 12, 13, 14, 19

### What To Build

Display the recorded run configuration wherever execution metadata needs to be understood quickly. Task cards should show compact provider/model information for in-progress, completed, and failed tasks. The task detail panel should show the run configuration near execution metadata. Historical rows without recorded run configuration should display "Unknown run configuration."

### Acceptance Criteria

- [x] In-progress task cards show the recorded provider/model label.
- [x] Completed task cards show the recorded provider/model label.
- [x] Failed task cards show the recorded provider/model label.
- [x] TODO task cards do not show run configuration data.
- [x] The task detail panel shows the recorded provider/model label near execution metadata.
- [x] Missing run configuration data displays as "Unknown run configuration."
- [x] UI display uses catalog labels rather than raw identifiers when the combination is known.
- [x] Manual validation covers in-progress, completed, failed, TODO, and historical missing-config displays.
- [x] Relevant lint/typecheck commands pass for touched code.
