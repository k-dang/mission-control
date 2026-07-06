Status: ready-for-agent

# Attempt event ingestion endpoint + heartbeat watchdog

## Parent

.scratch/harness-runner-protocol/PRD.md

## What to build

The uniform Convex-side contract for push harnesses (ADR 0001). An HTTP ingestion endpoint accepts batches of normalized Attempt events (the existing todo-event payload union, each with its idempotency `eventKey`) and terminal reports (COMPLETED / FAILED / CANCELLED with optional reason), authenticated by a per-Attempt bearer token minted when the Attempt starts and stored on the Attempt. Events append through the existing dedupe so at-least-once delivery is safe; a terminal report drives the existing finish/fail flow (todo status, PR creation, sandbox teardown). A generic heartbeat watchdog — rescheduled while the Attempt is live — fails an Attempt whose host has gone silent past a threshold and stops its Sandbox. The OpenCode native pull path is untouched; any pull-protocol artifacts from the retired delivery skeleton (protocol package, skeleton runner server, bundling pipeline) are deleted completely as part of this work.

## Acceptance criteria

- [ ] A simulated host (e.g. scripted POSTs) can drive a full Attempt lifecycle: token-authenticated event batches appear in the transmission log in order, duplicates are absorbed, and a terminal report completes or fails the Todo Task with PR creation and teardown behaving as today
- [ ] Requests with a missing, wrong, or already-terminal Attempt token are rejected without side effects
- [ ] An Attempt with no events/heartbeat past the threshold is finalized FAILED with a clear reason and its Sandbox is stopped
- [ ] Ingestion contract suite covers token handling, dedupe under duplicate delivery, terminal transitions, and watchdog behavior with convex-test, in the style of the existing todo-runs tests
- [ ] No pull-protocol artifacts remain in the tree (no shims, no "kept for reference" packages)
- [ ] OpenCode Attempts still run at parity, unaffected
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass; `pnpm dev:backend` starts cleanly

## Blocked by

- .scratch/harness-runner-protocol/issues/01-rename-storage-to-attempt-vocabulary.md
