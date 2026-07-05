Status: done

# Rename storage to Attempt vocabulary

## Parent

.scratch/harness-runner-protocol/PRD.md

## What to build

Purely mechanical rename of the OpenCode-branded storage to the harness-neutral **Attempt** vocabulary from CONTEXT.md, with no behavior change. The sandbox row's `opencode` state object becomes `attempt`, the events table's `opencodeSessionId` becomes `attemptId`, and the tool-call-counts table loses its OpenCode prefix. Use the widen–migrate–narrow pattern with the Convex migrations component: widen the schema to accept both shapes, backfill, then narrow to the new names only. Update every producer, consumer, and UI reference to the renamed fields.

## Acceptance criteria

- [x] Schema, validators, functions, and UI speak only in `attempt` / `attemptId` / deprefixed tool-call-counts vocabulary; no `opencode`-named storage fields remain after the narrow step
- [x] Existing rows are migrated in place; historical Attempts render in the UI exactly as before
- [x] Legacy fields were dropped via a widen -> backfill -> narrow pass against the real dev deployment, verified once by inspecting the migrated data directly. The migrations component/tooling was removed afterward (no future job for it on this dev-scale dataset) rather than kept as a permanently-tested artifact.
- [x] Behavior is unchanged: a real end-to-end Attempt runs at parity before and after
- [x] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass; `pnpm dev:backend` starts cleanly

## Blocked by

None - can start immediately
