Status: ready-for-agent

# Runner delivery skeleton

## Parent

.scratch/harness-runner-protocol/PRD.md

## What to build

The mechanics that get runner code into a Sandbox and prove the protocol's transport, before any harness logic exists (see ADR 0001). Create the runners workspace: a shared protocol package defining the runner HTTP contract (`health`, `attempt`, `events`, `status`) and its normalized event envelope (todo-event payload + `eventKey` + monotonic sequence ID), plus a minimal skeleton runner that serves `health` and `status`. Add the build step that bundles each runner into a single JS artifact shipped inside the Convex deployment, and the orchestration step that writes the bundle into the Sandbox and launches it detached on the exposed port. Start the contract-test suite: the shared suite skeleton running against a fake in-memory runner.

## Acceptance criteria

- [ ] A real Attempt boots a Sandbox, uploads the skeleton runner bundle, launches it detached, and the orchestrator reads `health` and `status` over the Sandbox's public URL
- [ ] The runner bundle is produced at build time and deploys atomically with the Convex functions that speak to it — no runtime fetch from any external host
- [ ] The protocol package is the single source of the contract types used by both the runner and the orchestrator-side client
- [ ] The contract-test suite runs against a fake in-memory runner and covers health/status semantics
- [ ] The runner endpoint is intentionally unauthenticated (deferred decision, ADR 0001) — do not add auth
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass

## Blocked by

None - can start immediately
