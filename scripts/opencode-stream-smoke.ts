import type { createOpencodeClient as createOpencodeClientType } from "@opencode-ai/sdk/v2";
import {
  type AppendTodoEventCallback,
  waitForOpencodeTerminalState,
} from "../convex/lib/opencodeStreamMonitor";
import type { TodoEventInput } from "../convex/lib/todoEventValidator";

const DEFAULT_BASE_URL = "http://localhost:4096";
const DEFAULT_TIMEOUT_MS = 180_000;

type Args = {
  baseUrl: string;
  directory?: string;
  expectKinds: string[];
  json: boolean;
  prompt?: string;
  sessionId?: string;
  timeoutMs: number;
  workspace?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    baseUrl: process.env.OPENCODE_URL ?? DEFAULT_BASE_URL,
    directory: process.env.OPENCODE_DIRECTORY,
    expectKinds: (process.env.OPENCODE_EXPECT_KINDS ?? "step_start,step_finish")
      .split(",")
      .map((kind) => kind.trim())
      .filter(Boolean),
    json: false,
    prompt: process.env.OPENCODE_PROMPT,
    sessionId: process.env.OPENCODE_SESSION_ID,
    timeoutMs: process.env.OPENCODE_TIMEOUT_MS
      ? Number(process.env.OPENCODE_TIMEOUT_MS)
      : DEFAULT_TIMEOUT_MS,
    workspace: process.env.OPENCODE_WORKSPACE,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--") {
      continue;
    }
    if (arg === "--base-url") {
      args.baseUrl = requireValue(arg, next);
      i += 1;
      continue;
    }
    if (arg === "--directory") {
      args.directory = requireValue(arg, next);
      i += 1;
      continue;
    }
    if (arg === "--workspace") {
      args.workspace = requireValue(arg, next);
      i += 1;
      continue;
    }
    if (arg === "--session-id") {
      args.sessionId = requireValue(arg, next);
      i += 1;
      continue;
    }
    if (arg === "--prompt") {
      args.prompt = requireValue(arg, next);
      i += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      args.timeoutMs = Number(requireValue(arg, next));
      i += 1;
      continue;
    }
    if (arg === "--expect-kinds") {
      args.expectKinds = requireValue(arg, next)
        .split(",")
        .map((kind) => kind.trim())
        .filter(Boolean);
      i += 1;
      continue;
    }
    if (arg === "--json") {
      args.json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number");
  }

  return args;
}

function requireValue(flag: string, value: string | undefined) {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function printUsage() {
  console.log(`Usage:
  pnpm smoke:opencode-stream -- --base-url http://localhost:4096 --prompt "Say ok"
  pnpm smoke:opencode-stream -- --session-id ses_123 --base-url http://localhost:4096

Options:
  --base-url       OpenCode server URL. Defaults to OPENCODE_URL or ${DEFAULT_BASE_URL}
  --directory      OpenCode directory query param. Defaults to OPENCODE_DIRECTORY
  --workspace      OpenCode workspace query param. Defaults to OPENCODE_WORKSPACE
  --session-id     Existing session to watch. Defaults to OPENCODE_SESSION_ID
  --prompt         Prompt to submit with session.promptAsync. Defaults to OPENCODE_PROMPT
  --timeout-ms     Max wait before aborting. Defaults to ${DEFAULT_TIMEOUT_MS}
  --expect-kinds   Comma-separated app milestone kinds. Defaults to step_start,step_finish
                   Useful: step_start,tool,step_finish
  --json           Print captured app milestone JSON
`);
}

function getResultData<T>(result: { data?: T; error?: unknown }, label: string) {
  if (result.error) {
    throw new Error(`${label} failed: ${formatUnknown(result.error)}`);
  }
  if (!("data" in result)) {
    throw new Error(`${label} returned an unexpected result`);
  }
  return result.data as T;
}

function formatUnknown(value: unknown) {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function describeCapturedEvent(event: TodoEventInput) {
  switch (event.event.kind) {
    case "session_status":
      return `${event.eventKey} -> session_status ${event.event.statusType}`;
    case "step_start":
      return `${event.eventKey} -> step_start ${[event.event.agent, event.event.model].filter(Boolean).join(" ")}`;
    case "step_finish":
      return `${event.eventKey} -> step_finish ${event.event.reason ?? ""}`;
    case "tool":
      return `${event.eventKey} -> tool ${event.event.tool} ${event.event.status}`;
    case "compaction":
      return `${event.eventKey} -> compaction ${event.event.auto ? "auto" : "manual"}`;
    case "todo_updated":
      return `${event.eventKey} -> todo_updated ${event.event.summary}`;
    case "session_compacted":
    case "patch":
    case "subtask":
    case "error":
      return `${event.eventKey} -> ${event.event.kind}`;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { createOpencodeClient } = (await import(
    "@opencode-ai/sdk/v2"
  )) as {
    createOpencodeClient: typeof createOpencodeClientType;
  };
  const client = createOpencodeClient({ baseUrl: args.baseUrl });
  const query = {
    ...(args.directory ? { directory: args.directory } : {}),
    ...(args.workspace ? { workspace: args.workspace } : {}),
  };

  getResultData(
    await withTimeout(client.global.health(), args.timeoutMs, "global.health"),
    "global.health",
  );

  let sessionId = args.sessionId;
  if (!sessionId) {
    const session = getResultData(
      await withTimeout(
        client.session.create(query, undefined),
        args.timeoutMs,
        "session.create",
      ),
      "session.create",
    );
    sessionId = session.id;
    console.log(`created session: ${sessionId}`);
  } else {
    console.log(`watching session: ${sessionId}`);
  }

  if (args.prompt) {
    console.log(`submitting prompt to ${sessionId}`);
    getResultData(
      await withTimeout(
        client.session.promptAsync(
          {
            ...query,
            sessionID: sessionId,
            parts: [{ type: "text", text: args.prompt }],
          },
          undefined,
        ),
        args.timeoutMs,
        "session.promptAsync",
      ),
      "session.promptAsync",
    );
  } else {
    console.log("no prompt supplied; listening only");
  }

  const captured: TodoEventInput[] = [];
  const appendTodoEvent: AppendTodoEventCallback = async (event) => {
    captured.push(event);
    console.log(args.json ? JSON.stringify(event) : describeCapturedEvent(event));
  };

  const deadline = Date.now() + args.timeoutMs;
  const outcome = await waitForTerminalWithRetries(
    client,
    sessionId,
    appendTodoEvent,
    deadline,
  );

  if (outcome.kind !== "terminal") {
    throw new Error("Monitor returned retry before terminal state");
  }
  if (outcome.terminalState !== "COMPLETED") {
    throw new Error(
      `Expected COMPLETED terminal state, got ${outcome.terminalState}: ${outcome.terminalReason ?? ""}`,
    );
  }

  const capturedKinds = new Set<TodoEventInput["event"]["kind"]>(
    captured.map((event) => event.event.kind),
  );
  const missing = args.expectKinds.filter(
    (kind) => !capturedKinds.has(kind as TodoEventInput["event"]["kind"]),
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing expected app milestone kind(s): ${missing.join(", ")}. Captured: ${
        Array.from(capturedKinds).join(", ") || "(none)"
      }`,
    );
  }

  console.log(
    `ok: captured ${captured.length} app milestone(s), terminal=${outcome.terminalState}`,
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function waitForTerminalWithRetries(
  client: ReturnType<typeof createOpencodeClientType>,
  sessionId: string,
  appendTodoEvent: AppendTodoEventCallback,
  deadline: number,
) {
  while (true) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error("waitForOpencodeTerminalState timed out");
    }

    const outcome = await withTimeout(
      waitForOpencodeTerminalState(
        client,
        sessionId,
        "manual_smoke",
        appendTodoEvent,
      ),
      remainingMs,
      "waitForOpencodeTerminalState",
    );

    if (outcome.kind === "terminal") {
      return outcome;
    }

    console.log("monitor slice returned retry; continuing");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
