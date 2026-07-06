Status: ready-for-agent

# Harness selection in Run Configuration

## Parent

.scratch/harness-runner-protocol/PRD.md

## What to build

Make the **Harness** a first-class, user-selectable part of the **Run Configuration**. The provider/model catalog becomes a harness-rooted tree (harness → providers → models), extending the existing `as const satisfies` catalog idiom, with a single OpenCode entry for now. Parsing and validation walk the tree; a stored Run Configuration missing `harnessId` parses as the OpenCode harness (historically true for all existing rows — no backfill). The run-configuration UI gains a harness selector that constrains the provider and model options shown, and Attempt history displays the harness as part of the configuration label.

## Acceptance criteria

- [x] User picks a Harness when starting a Todo Task; provider/model choices are constrained to that Harness's subtree; invalid combinations are rejected server-side
- [x] `harnessId` is captured on the Attempt at start and frozen thereafter, like the rest of the Run Configuration
- [x] Rows without `harnessId` parse and display as OpenCode runs; the "Unknown run configuration" fallback still covers retired entries
- [x] Catalog walking, legacy defaulting, and rejection paths are unit-tested in the existing run-configuration test style
- [ ] Verified in the running app: harness selector renders, selection persists, history shows harness · provider · model
- [x] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass

## Blocked by

- .scratch/harness-runner-protocol/issues/01-rename-storage-to-attempt-vocabulary.md (shared schema/validator surface)
