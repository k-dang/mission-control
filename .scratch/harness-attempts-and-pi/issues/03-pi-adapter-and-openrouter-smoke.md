Status: ready-for-agent

# Pi Adapter and OpenRouter Smoke

## What to build

Add the Pi Harness adapter and prove it through a live OpenRouter Sandbox smoke without exposing Pi in the board UI yet. Install the pinned Pi CLI per Sandbox Attempt, use the shared Todo Task prompt, run detached JSON mode with the agreed trust and session settings, monitor command logs in slices, and project safe normalized Attempt Events with deterministic replay keys.

## Acceptance criteria

- [ ] Pi installs from the pinned upstream npm package with lifecycle scripts disabled and starts from the repository directory with JSON mode, ephemeral sessions, project trust override, default tools, and no explicit thinking setting.
- [ ] The adapter stores Pi's Sandbox command ID as the Attempt's opaque Harness Run ID and reconnects during bounded monitor slices.
- [ ] Valid Pi JSON stdout produces only supported normalized lifecycle and tool milestones; raw events, assistant text, tool arguments, and tool results are not persisted.
- [ ] Split command-log chunks, replayed logs, unknown event types, malformed stdout, stderr diagnostics, nonzero exit, timeout, lost stream, and best-effort early process termination have defined and tested outcomes.
- [ ] A live developer Sandbox smoke succeeds for `openrouter/cohere/north-mini-code:free`, including installation, credential resolution, model invocation, JSON projection, repository workflow, and cleanup.
- [ ] Pi remains unavailable in the normal start dialog until the catalog-exposure issue is complete.

## Blocked by

- [01-attempt-backed-opencode-execution](01-attempt-backed-opencode-execution.md)
