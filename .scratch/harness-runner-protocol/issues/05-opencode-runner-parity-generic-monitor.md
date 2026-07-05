Status: ready-for-agent

# OpenCode runner at parity + generic monitor

## Parent

.scratch/harness-runner-protocol/PRD.md

## What to build

The core tracer bullet: OpenCode becomes the first real Harness behind the runner protocol, and the orchestrator's OpenCode-dialect monitoring is replaced by one harness-agnostic monitor — at full behavior parity. The OpenCode runner installs the pinned OpenCode CLI, writes its config, starts its server (internal to the Sandbox; the runner is the only exposed surface), accepts the task via `POST /attempt`, translates native events through the relocated OpenCode projector into the normalized envelope, buffers them with monotonic sequence IDs, and reports terminal state (COMPLETED / FAILED / CANCELLED with reason) via `status`. The generic slice monitor consumes the protocol: bounded slices, self-rescheduling with `Last-Event-ID` resume, `status` fallback at slice boundaries, terminal handling feeding the existing finish/fail mutations, then PR creation and sandbox teardown as today.

## Acceptance criteria

- [ ] A real end-to-end Attempt (start → sandbox → runner → OpenCode → transmission log → PR → teardown) behaves at parity with the pre-refactor flow
- [ ] The transmission log is gap-free across monitor slices: reconnects resume from the last sequence ID with no missing or duplicated milestones
- [ ] Terminal states map correctly: completion → COMPLETED, session error → FAILED with reason, abort → CANCELLED, and the Todo Task status/PR fields update accordingly
- [ ] No orchestrator code imports the OpenCode SDK or knows its event dialect; all OpenCode knowledge lives in the runner package
- [ ] The shared contract-test suite passes against both the fake in-memory runner and the real OpenCode runner started in-process
- [ ] The relocated projector keeps its unit tests; monitor slice/retry/resume/terminal logic is covered against the fake runner
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass; `pnpm dev:backend` starts cleanly

## Blocked by

- .scratch/harness-runner-protocol/issues/01-rename-storage-to-attempt-vocabulary.md
- .scratch/harness-runner-protocol/issues/02-harness-selection-in-run-configuration.md
- .scratch/harness-runner-protocol/issues/03-orchestrator-side-pr-metadata.md (the old metadata path prompts the OpenCode server directly, which loses its public URL once the runner fronts the port)
- .scratch/harness-runner-protocol/issues/04-runner-delivery-skeleton.md
