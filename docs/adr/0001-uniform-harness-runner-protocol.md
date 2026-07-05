# Uniform harness runner protocol inside the Sandbox

We want Attempts to be executable by different agent Harnesses (OpenCode today; Pi, Cursor, Flue-style harnesses later), but the candidate SDKs have incompatible shapes: OpenCode is an HTTP server, while Pi and Cursor are embedded Node libraries with no server to reattach to — and the Convex orchestrator *must* reattach, because its actions die every few minutes while the Attempt keeps running. We decided that every Harness runs behind a small "runner" process we control inside the Sandbox, exposing one uniform HTTP contract (`health`, `attempt`, `events`, `status`), with events normalized to our persisted todo-event payload union at the source and made resumable via monotonic sequence IDs. OpenCode is wrapped like everyone else — the orchestrator holds exactly one monitor implementation, and all per-harness variance lives in the runner bundle uploaded into the Sandbox.

## Considered Options

- **Per-harness Convex adapters** — rejected: embedded SDKs need an in-sandbox runner anyway, and we would end up maintaining N variants of the reattaching slice monitor, the most fragile code in the system.
- **Hybrid (OpenCode native, runner protocol for the rest)** — rejected: leaves two monitor paths forever and keeps OpenCode as the special case the refactor exists to remove.
- **Harnesses executing outside the Sandbox** (e.g. Cursor cloud mode) — out of scope by definition: a Harness runs inside the Sandbox (see CONTEXT.md).

## Consequences

- Adding a harness means writing a runner (projector + protocol server) and a catalog entry; orchestration code is untouched.
- Runner code is bundled at build time and shipped inside the Convex deployment, so protocol versions can never skew between orchestrator and runner. Heavy harness SDKs (native binaries) are installed inside the Sandbox at Attempt start, version-pinned.
- PR title/body generation moves out of the harness to an orchestrator-side model call — the runner protocol is the *only* way the orchestrator talks to a Harness.
- **Deliberately deferred:** the runner endpoint is public and unauthenticated, matching today's exposure. A per-Attempt bearer token was considered and consciously postponed as a separate security effort — this was a choice, not an oversight.
