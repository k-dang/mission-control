Status: ready-for-agent

# Sandbox lifecycle hardening

## Parent

.scratch/harness-runner-protocol/PRD.md

## What to build

Two lifecycle fixes kept out of the parity slice so that one stays a pure behavior-preserving diff. First, Attempts must survive past the initial sandbox timeout: the generic monitor extends the Sandbox's lifetime each slice, up to a configurable maximum Attempt duration; hitting the maximum finalizes the Attempt as FAILED with a clear timeout reason instead of dying silently. Second, close the provisioning leak: any failure after sandbox creation (git identity, recording, runner upload/launch) stops the sandbox rather than orphaning it.

## Acceptance criteria

- [ ] An Attempt running longer than the initial sandbox timeout keeps running and completes normally (verified with a real long-running Attempt)
- [ ] An Attempt exceeding the configured maximum duration is finalized FAILED with a timeout reason, and its sandbox is stopped
- [ ] An induced failure between sandbox creation and runner start leaves no running sandbox behind
- [ ] Extension/max-duration decision logic is unit-tested against the fake runner; mutation effects covered with convex-test
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass

## Blocked by

- .scratch/harness-runner-protocol/issues/05-opencode-runner-parity-generic-monitor.md
