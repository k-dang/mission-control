Status: done

# Orchestrator-side PR metadata generation

## Parent

.scratch/harness-runner-protocol/PRD.md

## What to build

Move pull-request title/body generation out of the Harness and into the orchestrator. After an Attempt completes with staged changes, the orchestrator generates PR metadata from the staged diff via a direct model call using one deployment-level metadata model and the AI Gateway credential the deployment already holds — instead of prompting the OpenCode session. Delete the per-provider PR-metadata-model map from the Run Configuration catalog and the OpenCode-session prompting path completely (no shims). Keep the existing fallback to todo-title/description metadata when generation fails, and the no-changes short-circuit.

## Acceptance criteria

- [ ] PR title/body are generated from the staged diff by a direct orchestrator-side model call; no code path prompts the Harness for metadata
- [ ] The per-provider metadata-model concept is fully removed from the catalog, config plumbing, and tests
- [ ] Generation failure falls back to todo-based metadata and the Attempt still completes with a PR
- [ ] An Attempt with no changes still completes without opening a PR
- [ ] Metadata prompt/normalization logic is unit-tested in the existing pull-request test style
- [ ] Verified with a real end-to-end Attempt producing a PR whose title/body describe the actual diff
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass

## Blocked by

None - can start immediately

## Comments

- Delivered in PR #20 ("Use AI SDK for PR metadata generation"): metadata is generated orchestrator-side via the AI SDK, and the per-provider metadata-model map was removed from the run-configuration catalog.
