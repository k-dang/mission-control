Status: ready-for-agent

# Sandbox lifecycle hardening

## Parent

.scratch/harness-runner-protocol/PRD.md

## What to build

Two lifecycle fixes. First, Attempts must survive past the initial sandbox timeout: the existing OpenCode slice monitor extends the Sandbox's lifetime each slice, up to a configurable maximum Attempt duration; hitting the maximum finalizes the Attempt as FAILED with a clear timeout reason instead of dying silently. Second, close the provisioning leak: any failure after sandbox creation (git identity, recording, OpenCode setup) stops the sandbox rather than orphaning it.

## Acceptance criteria

- [ ] An Attempt running longer than the initial sandbox timeout keeps running and completes normally (verified with a real long-running Attempt)
- [ ] An Attempt exceeding the configured maximum duration is finalized FAILED with a timeout reason, and its sandbox is stopped
- [ ] An induced failure between sandbox creation and runner start leaves no running sandbox behind
- [ ] Extension/max-duration decision logic is unit-tested in the existing stream-monitor test style; mutation effects covered with convex-test
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass

## Blocked by

None - can start immediately
