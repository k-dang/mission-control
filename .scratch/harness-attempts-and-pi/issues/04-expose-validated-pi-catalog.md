Status: ready-for-agent

# Expose Validated Pi Catalog

## What to build

Expose Pi as a normal Harness option only when a supported provider/model entry has a configured credential and has passed its required live Sandbox smoke. The initial catalog contains OpenRouter North Mini and Vercel AI Gateway Kimi. The start dialog and backend validation must share the same availability rules while preserving the existing Run Configuration and retry behavior.

## Acceptance criteria

- [ ] Pi is hidden when neither required credential is configured, and is shown only with the provider/model entries whose credentials are currently available.
- [ ] The initial Pi catalog uses Pi-native provider IDs for `openrouter/cohere/north-mini-code:free` and `vercel-ai-gateway/moonshotai/kimi-k2.5`; credentials are resolved by integration code and are never stored in a Run Configuration.
- [ ] The start dialog constrains Provider and model choices to the selected Harness and presents the same Pi availability that backend start-time validation enforces.
- [ ] A forged, stale, or credential-unavailable Pi Run Configuration is rejected before an Attempt starts.
- [ ] Both initial Pi entries pass independent live end-to-end Sandbox smoke validation before becoming selectable, including the Vercel AI Gateway Kimi path.
- [ ] A selected Pi Attempt follows the standard Attempt lifecycle, retry flow, normalized event history, pull-request orchestration, and terminal Sandbox cleanup.
- [ ] Catalog, start validation, UI-contract, and end-to-end smoke tests demonstrate the behavior.

## Blocked by

- [02-retryable-attempts](02-retryable-attempts.md)
- [03-pi-adapter-and-openrouter-smoke](03-pi-adapter-and-openrouter-smoke.md)
