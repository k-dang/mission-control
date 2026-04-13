import type { Event, EventSessionError, OpencodeClient } from "@opencode-ai/sdk";

const OPENCODE_HEALTH_PATH = "/global/health";
const HEALTH_TIMEOUT_MS = 20_000;
const HEALTH_POLL_INTERVAL_MS = 4_000;
const OPENCODE_EVENT_MAX_RETRY_ATTEMPTS = 5;

type OpencodeTerminalState = "COMPLETED" | "FAILED" | "CANCELLED";

type OpencodeTerminalResult = {
  terminalAt: number;
  terminalReason?: string;
  terminalState: OpencodeTerminalState;
};

type OpencodeStreamLogState = {
  lastSessionStatus?: string;
  lastTodoSummary?: string;
  seenCompactionPartIds: Set<string>;
  seenPatchPartIds: Set<string>;
  seenStepFinishPartIds: Set<string>;
  seenStepStartPartIds: Set<string>;
  seenSubtaskPartIds: Set<string>;
  toolStateByCallId: Map<string, string>;
};

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHealthyResponse(health: unknown): health is { healthy: true } {
  return (
    typeof health === "object" &&
    health !== null &&
    "healthy" in health &&
    health.healthy === true
  );
}

export async function waitForOpencodeHealth(publicUrl: string) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let lastFailure = "no response received";
  let attempt = 0;
  const healthUrl = `${publicUrl}${OPENCODE_HEALTH_PATH}`;

  await sleep(HEALTH_POLL_INTERVAL_MS);

  while (Date.now() < deadline) {
    attempt += 1;
    try {
      const res = await fetch(healthUrl);

      if (!res.ok) {
        lastFailure = `health endpoint returned ${res.status}`;
        console.info("OpenCode health check pending", {
          attempt,
          status: res.status,
          url: healthUrl,
        });
      } else {
        const health = await res.json();
        if (isHealthyResponse(health)) {
          console.info("OpenCode health check passed", {
            attempt,
            url: healthUrl,
          });
          return health;
        }
        lastFailure = "health endpoint did not report healthy";
        console.info("OpenCode health check pending", {
          attempt,
          reason: lastFailure,
          url: healthUrl,
        });
      }
    } catch (error) {
      lastFailure =
        error instanceof Error ? error.message : "health check failed";
      console.info("OpenCode health check pending", {
        attempt,
        reason: lastFailure,
        url: healthUrl,
      });
    }

    await sleep(HEALTH_POLL_INTERVAL_MS);
  }

  throw new Error(
    `OpenCode did not become healthy within ${HEALTH_TIMEOUT_MS}ms: ${lastFailure}`,
  );
}

export function buildOpencodeConfigJson(
  aiGatewayApiKey: string,
  modelId: string,
) {
  return JSON.stringify(
    {
      $schema: "https://opencode.ai/config.json",
      enabled_providers: ["vercel"],
      provider: {
        vercel: {
          options: { apiKey: aiGatewayApiKey },
          models: { [modelId]: {} },
        },
      },
      model: modelId,
    },
    null,
    2,
  );
}

export function buildTodoPrompt(
  title: string,
  description?: string,
  githubUrl?: string,
) {
  const lines = [
    "Understand the codebase before making changes, then implement the requested task with minimal, correct edits.",
    "Run the most relevant validation for the files you change before you finish.",
    "Task:",
    title.trim(),
  ];

  const trimmedDescription = description?.trim();
  if (trimmedDescription) {
    lines.push("", "Additional context:", trimmedDescription);
  }

  if (githubUrl?.trim()) {
    lines.push("", "Repository:", githubUrl.trim());
  }

  lines.push(
    "Expected outcome:",
    "1. Make the code changes needed to complete the task.",
    "2. Run relevant validation commands for the change.",
    "3. Summarize what you changed and any follow-up risks or notes.",
  );

  return lines.join("\n");
}

export function getOpencodeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function getTerminalResultFromError(
  event: EventSessionError,
): OpencodeTerminalResult {
  const error = event.properties.error;
  const terminalAt = Date.now();

  if (error?.name === "MessageAbortedError") {
    return {
      terminalAt,
      terminalReason: error.data.message,
      terminalState: "CANCELLED",
    };
  }

  return {
    terminalAt,
    terminalReason: error
      ? getOpencodeErrorMessage(error)
      : "OpenCode session ended with an unknown error",
    terminalState: "FAILED",
  };
}

function getTerminalResultForEvent(
  event: Event,
  sessionId: string,
): OpencodeTerminalResult | null {
  if (
    event.type === "session.status" &&
    event.properties.sessionID === sessionId &&
    event.properties.status.type === "idle"
  ) {
    return {
      terminalAt: Date.now(),
      terminalState: "COMPLETED",
    };
  }

  if (
    event.type === "session.idle" &&
    event.properties.sessionID === sessionId
  ) {
    return {
      terminalAt: Date.now(),
      terminalState: "COMPLETED",
    };
  }

  if (
    event.type === "session.error" &&
    event.properties.sessionID === sessionId
  ) {
    return getTerminalResultFromError(event);
  }

  return null;
}

function summarizeTodos(todos: Array<{ status: string }>) {
  const counts = new Map<string, number>();
  for (const todo of todos) {
    counts.set(todo.status, (counts.get(todo.status) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `${status}:${count}`)
    .join(", ");
}

function logOpencodeMilestone(
  event: Event,
  state: OpencodeStreamLogState,
  sessionId: string,
  todoId: string,
) {
  if (event.type === "session.status" && event.properties.sessionID === sessionId) {
    const status = event.properties.status;
    if (status.type === "idle") {
      return;
    }

    const summary =
      status.type === "retry"
        ? `retry:${status.attempt}:${status.message}:${status.next}`
        : status.type;
    if (state.lastSessionStatus === summary) {
      return;
    }
    state.lastSessionStatus = summary;

    if (status.type === "busy") {
      console.info("OpenCode session started work", {
        todoId,
        sessionId,
      });
      return;
    }

    console.warn("OpenCode session retrying", {
      todoId,
      sessionId,
      attempt: status.attempt,
      message: status.message,
      next: status.next,
    });
    return;
  }

  if (event.type === "todo.updated" && event.properties.sessionID === sessionId) {
    const summary = summarizeTodos(event.properties.todos);
    if (state.lastTodoSummary === summary) {
      return;
    }
    state.lastTodoSummary = summary;

    console.info("OpenCode todo list updated", {
      todoId,
      sessionId,
      todoCount: event.properties.todos.length,
      summary,
    });
    return;
  }

  if (event.type === "permission.updated" && event.properties.sessionID === sessionId) {
    console.warn("OpenCode permission requested", {
      todoId,
      sessionId,
      permissionType: event.properties.type,
      title: event.properties.title,
    });
    return;
  }

  if (event.type === "session.compacted" && event.properties.sessionID === sessionId) {
    console.info("OpenCode session compacted", {
      todoId,
      sessionId,
    });
    return;
  }

  if (event.type !== "message.part.updated") {
    return;
  }

  const { part } = event.properties;
  if (part.sessionID !== sessionId) {
    return;
  }

  if (part.type === "step-start") {
    if (state.seenStepStartPartIds.has(part.id)) {
      return;
    }
    state.seenStepStartPartIds.add(part.id);

    console.info("OpenCode step started", {
      todoId,
      sessionId,
      messageId: part.messageID,
    });
    return;
  }

  if (part.type === "step-finish") {
    if (state.seenStepFinishPartIds.has(part.id)) {
      return;
    }
    state.seenStepFinishPartIds.add(part.id);

    console.info("OpenCode step finished", {
      todoId,
      sessionId,
      messageId: part.messageID,
      reason: part.reason,
    });
    return;
  }

  if (part.type === "tool") {
    const previousStatus = state.toolStateByCallId.get(part.callID);
    const nextStatus = part.state.status;
    if (previousStatus === nextStatus) {
      return;
    }
    state.toolStateByCallId.set(part.callID, nextStatus);

    if (nextStatus === "running") {
      console.info("OpenCode tool started", {
        todoId,
        sessionId,
        tool: part.tool,
        title: part.state.title,
      });
      return;
    }

    if (nextStatus === "completed") {
      console.info("OpenCode tool finished", {
        todoId,
        sessionId,
        tool: part.tool,
        title: part.state.title,
      });
      return;
    }

    if (nextStatus === "error") {
      console.warn("OpenCode tool failed", {
        todoId,
        sessionId,
        tool: part.tool,
        error: part.state.error,
      });
    }
    return;
  }

  if (part.type === "patch") {
    if (state.seenPatchPartIds.has(part.id)) {
      return;
    }
    state.seenPatchPartIds.add(part.id);

    console.info("OpenCode patch created", {
      todoId,
      sessionId,
      fileCount: part.files.length,
      files: part.files.slice(0, 5),
    });
    return;
  }

  if (part.type === "compaction") {
    if (state.seenCompactionPartIds.has(part.id)) {
      return;
    }
    state.seenCompactionPartIds.add(part.id);

    console.info("OpenCode compaction created", {
      todoId,
      sessionId,
      auto: part.auto,
    });
    return;
  }

  if (part.type === "subtask") {
    if (state.seenSubtaskPartIds.has(part.id)) {
      return;
    }
    state.seenSubtaskPartIds.add(part.id);

    console.info("OpenCode subtask started", {
      todoId,
      sessionId,
      agent: part.agent,
      description: part.description,
    });
  }
}

export async function waitForOpencodeTerminalState(
  client: OpencodeClient,
  sessionId: string,
  todoId: string,
) {
  const eventStream = await client.event.subscribe({
    onSseError: (error) => {
      console.warn("OpenCode event stream error", {
        todoId,
        sessionId,
        error: getOpencodeErrorMessage(error),
      });
    },
    sseMaxRetryAttempts: OPENCODE_EVENT_MAX_RETRY_ATTEMPTS,
  });

  let sawAnyEvent = false;
  const logState: OpencodeStreamLogState = {
    seenCompactionPartIds: new Set(),
    seenPatchPartIds: new Set(),
    seenStepFinishPartIds: new Set(),
    seenStepStartPartIds: new Set(),
    seenSubtaskPartIds: new Set(),
    toolStateByCallId: new Map(),
  };

  for await (const event of eventStream.stream) {
    if (!sawAnyEvent) {
      sawAnyEvent = true;
      console.info("OpenCode SSE first event (stream is live)", {
        todoId,
        sessionId,
        eventType: event.type,
      });
    }

    logOpencodeMilestone(event, logState, sessionId, todoId);

    const terminal = getTerminalResultForEvent(event, sessionId);
    if (terminal) {
      console.info("OpenCode SSE reached terminal state", {
        todoId,
        sessionId,
        terminalState: terminal.terminalState,
        terminalReason: terminal.terminalReason,
      });
      return terminal;
    }
  }

  return null;
}
