# Uniform ingestion contract at the Convex boundary, per-harness transport

We want Attempts to be executable by different agent Harnesses (OpenCode today; Pi, Cursor-local, Flue-style harnesses later), but the candidate SDKs have incompatible shapes: OpenCode is an HTTP server, while Pi and Cursor are embedded Node libraries with no server for the orchestrator to reattach to across Convex action lifetimes. We decided the uniform abstraction is the **Convex ingestion contract**: an HTTP endpoint that accepts Attempt events (already normalized to the persisted todo-event vocabulary, idempotent via `eventKey`) and terminal reports (COMPLETED / FAILED / CANCELLED with reason), authenticated by a per-Attempt token. Transport is deliberately *not* uniform per Harness: OpenCode keeps its existing native pull path (server + SSE slice monitor) unchanged, while embedded-SDK harnesses run a small bespoke host script in the Sandbox that subscribes to native SDK events and pushes them to the ingestion endpoint with retries.

## Considered Options

- **Uniform pull-based runner protocol inside the Sandbox** — every harness wrapped by a runner server exposing one HTTP/SSE contract, OpenCode included, so the orchestrator holds a single reattaching monitor. We initially chose this and built its delivery skeleton, then reversed: wrapping embedded SDKs in servers exists only to solve *reattachment*, a problem the pull model itself creates. It forced fragile buffer/resume machinery plus a real runner-delivery problem (bundling server artifacts into the deployment) onto every future harness.
- **Per-harness Convex adapters talking natively to each SDK** — rejected: multiplies the trickiest orchestration code (stream monitoring across action lifetimes) per harness shape.
- **Fully bespoke integrations with no shared contract at all** — rejected: the event vocabulary, terminal semantics, and catalog must be uniform anyway (the UI and todo lifecycle consume them); leaving the ingestion surface undefined would just recreate it ad hoc per harness.
- **Harnesses executing outside the Sandbox** (e.g. Cursor cloud mode) — out of scope by definition: a Harness runs inside the Sandbox (see CONTEXT.md).

## Consequences

- Two transport patterns coexist by design: pull-native (OpenCode, unchanged and battle-tested) and push-ingestion (all future embedded harnesses). Adding a push harness touches a host script, a projector, and a catalog entry — no orchestration code.
- Push harnesses need no public endpoint in the Sandbox, no event buffering, and no slice monitor; monitoring reduces to a generic heartbeat watchdog that fails Attempts gone silent.
- At-least-once delivery is handled by the existing `eventKey` dedupe on event append; hosts POST with retries.
- Host scripts are small (SDK subscribe + fetch), so delivery is trivial: shipped as source with the deployment and written into the Sandbox at Attempt start; heavyweight harness SDKs are still npm-installed in-Sandbox at pinned versions.
- PR title/body generation is an orchestrator concern (direct model call from the staged diff) — the ingestion contract is the *only* way a Harness talks to the orchestrator.
- **Deliberately deferred:** the OpenCode server remains publicly exposed and unauthenticated, matching its pre-refactor posture; hardening it is a separate security effort — a choice, not an oversight. The ingestion endpoint, by contrast, requires its per-Attempt token from day one.
