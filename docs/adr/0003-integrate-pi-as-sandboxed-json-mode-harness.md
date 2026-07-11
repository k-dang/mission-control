# Integrate Pi as a sandboxed JSON-mode harness

Pi v1 should run as a second Harness inside the existing Sandbox boundary. The first implementation should install a pinned `@earendil-works/pi-coding-agent` CLI version per Attempt with `npm install -g --ignore-scripts` as part of the Sandbox startup command, then execute `pi --mode json --no-session --approve` non-interactively. `--approve` enables the agreed project-trust behavior for the target repository. JSON mode is preferred over `pi -p` because the product needs structured progress events, and it is preferred over a custom SDK host script because the CLI already exposes a structured integration surface without adding custom runtime glue.

Pi runs as a detached Sandbox command and is monitored in bounded scheduled Action slices, following the existing OpenCode monitor pattern. Monitor slices extend the shared 30-minute Sandbox Attempt budget as needed; exhausting the budget fails the Attempt. Pi JSON-line sequence positions produce deterministic Attempt Event keys, so replaying command logs after a monitor handoff is idempotent.

Pi and OpenCode share one harness-neutral task prompt built from the Todo Task title, optional description, repository URL, and expected workflow. Harness-specific setup remains outside that prompt so task intent stays comparable across Harnesses.

Pi v1 passes no explicit thinking level and uses the selected model's Pi default. Thinking controls do not become part of the Run Configuration until baseline cost and latency are understood.

Pi v1 keeps its default built-in coding tools enabled. The Sandbox, its credentials, and its network policy remain the execution boundary; tool restrictions are deferred until a concrete product policy requires them.

Pi inherits the existing Sandbox network policy for v1, which permits normal project, package-installation, GitHub, and provider traffic. Restricted egress and credential brokering are a shared Sandbox hardening effort, not a Pi-specific prerequisite.

The app persists only normalized Attempt Events, not raw Pi JSON payloads. Pi uses the existing normalized Attempt Event vocabulary for v1; a new event kind is added only when Pi has product-visible progress that cannot be represented without losing meaning. The projector persists lifecycle and tool metadata plus final errors, but omits assistant text, tool arguments, and tool results. The projector ignores unknown Pi event types and records only event kinds it explicitly supports; this lets Pi add telemetry without breaking existing Attempts. Stdout is the Pi JSON-mode protocol: a malformed line fails the Attempt. Stderr is retained only as diagnostic text, not parsed as structured events. Pi process exit code `0` means the Harness Attempt completed; nonzero exit, timeout, lost command stream, or malformed required JSON means the Attempt failed. On a failure detected before the process exits, the system best-effort terminates Pi before recording the terminal failure. A completed Pi Attempt does not by itself complete the Todo Task: app-owned pull request orchestration still inspects the sandbox diff, generates PR metadata, commits, pushes, and opens the PR, then decides the Todo Task outcome.

Pi Provider credentials are resolved by integration code from Convex environment variables and passed into the Sandbox command environment as needed. The curated catalog exposes only provider/model selections whose required credential is configured; start-time validation enforces the same rule. Run Configurations store Harness, Provider, and model selection only; they do not store secrets.

Pi exposes only a curated provider/model catalog in the start dialog. The app may support fewer Pi combinations than the upstream CLI supports so that listed options remain tied to known credentials, event projection, prompt behavior, and PR workflow expectations.

Pi v1 exposes Vercel AI Gateway and OpenRouter in the curated catalog. Its native provider IDs are `vercel-ai-gateway` and `openrouter`. The Vercel AI Gateway entry uses `moonshotai/kimi-k2.5`, matching the existing OpenCode default and using the existing `AI_GATEWAY_API_KEY` credential path. The OpenRouter entry uses `cohere/north-mini-code:free`. Every curated Pi provider/model entry requires a live end-to-end Sandbox smoke run before it is exposed.

Pi is exposed as a normal Harness option once implemented, without a development flag. It is omitted from the start dialog when no configured Pi provider/model entry is available. Confidence should come from the OpenCode-to-Attempt refactor tests, Pi event-projection tests, and an end-to-end smoke run rather than hiding the Harness behind runtime configuration.

## Considered Options

- **`pi -p` print mode** - useful for smoke tests, but too little structured telemetry for the normal product path.
- **Custom SDK host script** - more control, but unnecessary for v1 while JSON mode is enough.
- **Prepared Sandbox snapshot with Pi preinstalled** - likely faster later, but adds snapshot lifecycle and versioning before Pi support works.
- **Persist raw Pi JSON events** - rejected because raw upstream payloads may be verbose, unstable, or contain prompt/context/tool data that should not become durable product state by default.

## Consequences

Pi upgrades are explicit compatibility work because JSON event shapes become part of the adapter contract. Sandbox environment, credentials, and network policy are the security boundary; Pi project trust only controls whether repository-local Pi resources are loaded.
