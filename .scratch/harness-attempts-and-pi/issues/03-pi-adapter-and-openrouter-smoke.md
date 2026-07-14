Status: needs-validation

# Pi Adapter and OpenRouter Smoke

## What to build

Add the Pi Harness adapter and prove it through a live OpenRouter Sandbox smoke without exposing Pi in the board UI yet. Install the pinned Pi CLI per Sandbox Attempt, use the shared Todo Task prompt, run detached JSON mode with the agreed trust and session settings, monitor command logs in slices, and project safe normalized Attempt Events with deterministic replay keys.

## Acceptance criteria

- [x] Pi installs from the pinned upstream npm package with lifecycle scripts disabled and starts from the repository directory with JSON mode, ephemeral sessions, project trust override, default tools, and no explicit thinking setting.
- [x] The adapter stores Pi's Sandbox command ID as the Attempt's opaque Harness Run ID and reconnects during bounded monitor slices.
- [x] Valid Pi JSON stdout produces only supported normalized lifecycle and tool milestones; raw events, assistant text, tool arguments, and tool results are not persisted.
- [x] Split command-log chunks, replayed logs, unknown event types, malformed stdout, stderr diagnostics, nonzero exit, timeout, lost stream, and best-effort early process termination have defined and tested outcomes.
- [x] A live developer Sandbox smoke succeeds for `openrouter/cohere/north-mini-code:free`, including installation, credential resolution, model invocation, JSON projection, repository workflow, and cleanup.
- [x] Pi remains unavailable in the normal start dialog until the catalog-exposure issue is complete.

## Blocked by

- [01-attempt-backed-opencode-execution](01-attempt-backed-opencode-execution.md)

## Validation note

Unit coverage: `piEventProjector.test.ts` (13 tests), `piStreamMonitor.test.ts` (16 tests, including split chunks, replay determinism, redacted malformed stdout, a final line without a newline, Pi-reported error plus exit 0, event-write handoff, lost stream, nonzero exit, stderr-diagnostic-only, bounded slice timeout, and budget exhaustion with best-effort kill), `piIntegration.test.ts` (3 production-action tests covering durable Pi failure, post-run PR failure, Sandbox reconnection loss, and cleanup), `piConfig.test.ts` (5 tests), `attemptLifetime.test.ts` (6 tests, including absolute-deadline clamping), `devTools.test.ts` (authenticated smoke boundary), plus updated `runConfiguration.test.ts` coverage for the Pi catalog entries. Full suite: 96/96 passing. `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm exec convex dev --once`, and React Doctor (100/100) are all clean.

Post-review hardening: Pi's monitor now treats terminal `agent_end` error/abort events as failed even when JSON mode exits 0, processes an unterminated final JSON line, redacts malformed stdout from durable failure reasons, replays after transient Attempt Event write failures, and clamps the final monitor slice and Sandbox lease to the absolute Attempt deadline. Sandbox reconnection is inside the failure/cleanup path. The developer Pi smoke actions now require authentication and are restricted to the fixed `k-dang/mission-control` smoke repository rather than accepting an arbitrary clone URL.

Live Sandbox smoke (`devTools.startPiSmokeSandbox` → `devTools.monitorPiSmokeSandbox` → `devTools.stopOpencodeSmokeSandbox`, run via `convex run` against the real deployment) for `openrouter/cohere/north-mini-code:free` against `k-dang/mission-control`:
- Installed Pi 0.80.6 globally via the pinned `npm install -g --ignore-scripts` command; `pi` resolved on PATH with no adjustment needed.
- Spawned `pi --mode json --no-session --approve --model openrouter/cohere/north-mini-code:free <task prompt>` detached; command id recorded and reconnected via `sandbox.getCommand`.
- Monitored via the production `waitForPiTerminalState`: captured 18 normalized Attempt Events (`step_start`/`tool`/`tool`/`step_finish` ×4, plus a final `step_start`/`step_finish`) — no raw JSON, assistant text, tool args, or tool results observed in the captured events.
- Reached `terminalState: "COMPLETED"` (Pi exited 0).
- Shared PR flow committed, pushed, and opened a real pull request: https://github.com/k-dang/mission-control/pull/24 (verified via `gh pr view 24`: 1 file, `NOTES-PI-SMOKE.md`, +1/-0, state OPEN).
- Sandbox stopped cleanly afterward.

Remaining human validation:
- The Vercel AI Gateway Pi entry (`vercel-ai-gateway/moonshotai/kimi-k2.5`) has not been live-smoked — only OpenRouter was in this issue's scope.
- PR #24 on `k-dang/mission-control` is left open for a human to review and close.
- A human may want to independently spot-check that no raw Pi JSON/assistant text ever reaches Convex storage (verified by code review + tests, not by inspecting a live `todoEvents` row from this smoke, since the dev smoke path doesn't create Todo/Attempt rows — see Comments below).

## Comments

- **Review finding carried forward to issue 04**: Pi is currently *hidden but startable*. The UI start dialog and dev catalog both omit Pi (`VISIBLE_RUN_CONFIGURATION_HARNESSES` excludes it, tested), but the public `todoRuns.start` mutation's backend validation (`parseRunConfiguration`) now accepts a hand-crafted Pi Run Configuration in its args, and `integrations/sandbox.ts` will happily dispatch it to the Pi harness — because start-time *availability* validation (rejecting a Pi Run Configuration when its credential isn't configured, or when it isn't a live-smoked/exposed catalog entry) is out of this issue's scope and is explicitly issue 04's acceptance criterion ("A forged, stale, or credential-unavailable Pi Run Configuration is rejected before an Attempt starts"). Issue 04 must close this gap before Pi is considered safe to expose.
