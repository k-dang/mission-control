Status: ready-for-agent

# Sandbox lifecycle hardening

## Parent

.scratch/harness-runner-protocol/PRD.md

## What to build

Two lifecycle fixes. First, Attempts must survive past the initial sandbox timeout: the existing OpenCode slice monitor extends the Sandbox's lifetime each slice, up to a configurable maximum Attempt duration; hitting the maximum finalizes the Attempt as FAILED with a clear timeout reason instead of dying silently. Second, close the provisioning leak: any failure after sandbox creation (git identity, recording, OpenCode setup) stops the sandbox rather than orphaning it.

## Acceptance criteria

- [x] An Attempt running longer than the initial sandbox timeout keeps running and completes normally (verified with a real long-running Attempt)
- [x] An Attempt exceeding the configured maximum duration is finalized FAILED with a timeout reason, and its sandbox is stopped
- [x] An induced failure between sandbox creation and runner start leaves no running sandbox behind
- [x] Extension/max-duration decision logic is unit-tested in the existing stream-monitor test style; mutation effects covered with convex-test
- [x] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass

## Blocked by

None - can start immediately

## Comments

- Implemented (2026-07-05): `decideAttemptLifetime` in `convex/lib/opencodeStreamMonitor.ts` decides timeout-vs-extend each monitor slice; extension is deadline-based (keeps the sandbox two slices ahead of now) so the buffer never erodes regardless of the configured maximum. Max duration configurable via `MAX_ATTEMPT_DURATION_MS` (default 30 min). Timeout finalizes via `todoRuns.failOrchestration` (FAILED + reason) then stops the sandbox. `spawnSandboxForTodo` now stops the sandbox on any failure after creation. The two real-run criteria (long-running Attempt survives past 10 min; induced provisioning failure leaves no sandbox) remain to be verified empirically before merge, per the PRD's testing decisions.
- Verified (2026-07-07): induced provisioning failure — temporary throw injected after `Sandbox.create`, run started from the UI; Convex logs showed `stopSandboxSafely` succeed ("Sandbox stopped for todo") before the rethrow, and the Vercel API confirmed the sandbox status as `stopped`. Note: the todo itself stayed IN PROGRESS after a provisioning failure (`spawnSandboxForTodo` rethrew without failing the todo) — fixed the same day: `spawnSandboxForTodo` now wraps the whole provisioning flow (config check, `Sandbox.create`, git identity, recording, scheduling) and its catch calls `failOrchestration` before stopping the sandbox and rethrowing, matching the `runTodo`/`monitorOpencodeStream` idiom. Re-verified with a second induced failure: the todo moved straight to FAILED and the Vercel API confirmed the sandbox stopped.
- Verified (2026-07-07): max-duration timeout — with `MAX_ATTEMPT_DURATION_MS=240000`, a sleep-600 attempt was finalized 4m05s in: attempt row FAILED with terminalReason "Attempt exceeded the maximum duration of 4 minutes", `shutdownSafe: true`, sandbox `stopped` per the Vercel API, card in the FAILED lane. Env override removed afterward (back to the 30-minute default).
- Verified (2026-07-07): long-run survival — a sleep-720 attempt ran 12m05s against the 10-minute initial sandbox timeout; monitor slices handed off every ~2 minutes with deadline-based extensions keeping the sandbox alive past its original deadline, then the run reached COMPLETED, no PR (no changes), and the sandbox was stopped (Vercel-confirmed). All acceptance criteria are now checked; issue is done.
