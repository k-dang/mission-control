import {
  type Event,
  type EventSessionError,
  type OpencodeClient,
} from "@opencode-ai/sdk/v2";

import type { TodoEventInput } from "./todoEventValidator";

export const OPENCODE_PORT = 4096;
export const OPENCODE_BIN = "/home/vercel-sandbox/.opencode/bin/opencode";
export const OPENCODE_CONFIG_PATH =
  "/home/vercel-sandbox/.config/opencode/opencode.json";
export const OPENCODE_PROVIDER_ID = "vercel";
export const DEFAULT_VERCEL_MODEL = "moonshotai/kimi-k2.5";
export const DEFAULT_VERCEL_SMALL_MODEL = "openai/gpt-5-nano";

const OPENCODE_HEALTH_POLL_INTERVAL_MS = 500;
const OPENCODE_HEALTH_TIMEOUT_MS = 30_000;
const OPENCODE_EVENT_MAX_RETRY_ATTEMPTS = 5;

type TerminalState = "COMPLETED" | "FAILED" | "CANCELLED";

export type TerminalResult = {
  terminalAt: number;
  terminalReason?: string;
  terminalState: TerminalState;
};

export type WaitForOpencodeTerminalStateResult =
  | ({ kind: "terminal" } & TerminalResult)
  | { kind: "retry" };

export type AppendTodoEventCallback = (input: TodoEventInput) => Promise<void>;

/**
 * HTTP-style SSE failures that will not heal by rescheduling the same URL/session.
 * After SDK retry exhaustion, these should finalize the run as FAILED, not loop forever.
 */
export function isUnrecoverableSseErrorMessage(message: string): boolean {
  const lower = message.toLowerCase();
  if (lower.includes("410")) return true;
  if (lower.includes("401") || lower.includes("403")) return true;
  if (lower.includes("404")) return true;
  if (lower.includes("not found") && lower.includes("sse")) return true;
  return false;
}

type OpencodeStreamLogState = {
  lastSessionStatus?: string;
  lastTodoSummary?: string;
  sessionCompactedSeq: number;
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

export async function waitForOpencodeHealth(client: OpencodeClient) {
  const deadline = Date.now() + OPENCODE_HEALTH_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const result = await client.global.health();

      if (!result.error && isHealthyResponse(result.data)) {
        return result.data;
      }
    } catch {
      // Ignore transient startup errors until the deadline expires.
    }

    if (Date.now() + OPENCODE_HEALTH_POLL_INTERVAL_MS >= deadline) {
      break;
    }

    await sleep(OPENCODE_HEALTH_POLL_INTERVAL_MS);
  }

  throw new Error(
    `OpenCode did not become healthy within ${OPENCODE_HEALTH_TIMEOUT_MS}ms`,
  );
}

export function buildTodoPrompt(
  title: string,
  description?: string,
  githubUrl?: string,
) {
  const lines = ["Task:", title.trim()];

  const trimmedDescription = description?.trim();
  if (trimmedDescription) {
    lines.push("", "Additional context:", trimmedDescription);
  }

  if (githubUrl?.trim()) {
    lines.push("", "Repository:", githubUrl.trim());
  }

  lines.push(
    "",
    "Expected workflow:",
    "1. Understand the codebase before editing.",
    "2. Make the code changes needed to complete the task.",
    "3. Run the most relevant validation for the files you change.",
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

function getTerminalResultFromError(event: EventSessionError): TerminalResult {
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
): TerminalResult | null {
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

function isToolEventStatus(
  status: string,
): status is "running" | "completed" | "error" {
  return status === "running" || status === "completed" || status === "error";
}

async function logOpencodeMilestone(
  event: Event,
  state: OpencodeStreamLogState,
  sessionId: string,
  todoId: string,
  onAppendTodoEvent?: AppendTodoEventCallback,
) {
  if (
    event.type === "session.error" &&
    event.properties.sessionID === sessionId
  ) {
    const message = getOpencodeErrorMessage(event.properties.error);
    const eventKey = `error:${message}`;
    if (onAppendTodoEvent) {
      await onAppendTodoEvent({ eventKey, event: { kind: "error", message } });
    }
    return;
  }

  if (
    event.type === "session.status" &&
    event.properties.sessionID === sessionId
  ) {
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

    const eventKey = `session_status:${summary}`;

    if (status.type === "busy") {
      console.info("OpenCode session started work", {
        todoId,
        sessionId,
      });
      if (onAppendTodoEvent) {
        await onAppendTodoEvent({
          eventKey,
          event: { kind: "session_status", statusType: "busy" },
        });
      }
      return;
    }

    if (status.type === "retry") {
      console.warn("OpenCode session retrying", {
        todoId,
        sessionId,
        attempt: status.attempt,
        message: status.message,
        next: status.next,
      });
      if (onAppendTodoEvent) {
        await onAppendTodoEvent({
          eventKey,
          event: {
            kind: "session_status",
            statusType: "retry",
            message: status.message,
            attempt: status.attempt,
            next: status.next,
          },
        });
      }
      return;
    }

    return;
  }

  if (
    event.type === "todo.updated" &&
    event.properties.sessionID === sessionId
  ) {
    const summary = summarizeTodos(event.properties.todos);
    if (state.lastTodoSummary === summary) {
      return;
    }
    state.lastTodoSummary = summary;

    const eventKey = `todo_updated:${summary}`;

    console.info("OpenCode todo list updated", {
      todoId,
      sessionId,
      todoCount: event.properties.todos.length,
      summary,
    });
    if (onAppendTodoEvent) {
      await onAppendTodoEvent({
        eventKey,
        event: {
          kind: "todo_updated",
          todoCount: event.properties.todos.length,
          summary,
        },
      });
    }
    return;
  }

  if (
    event.type === "session.compacted" &&
    event.properties.sessionID === sessionId
  ) {
    state.sessionCompactedSeq += 1;
    const eventKey = `session_compacted:${sessionId}:${state.sessionCompactedSeq}`;

    console.info("OpenCode session compacted", {
      todoId,
      sessionId,
    });
    if (onAppendTodoEvent) {
      await onAppendTodoEvent({ eventKey, event: { kind: "session_compacted" } });
    }
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

    const eventKey = `step_start:${part.id}`;

    console.info("OpenCode step started", {
      todoId,
      sessionId,
      messageId: part.messageID,
    });
    if (onAppendTodoEvent) {
      await onAppendTodoEvent({
        eventKey,
        event: { kind: "step_start", messageId: part.messageID },
      });
    }
    return;
  }

  if (part.type === "step-finish") {
    if (state.seenStepFinishPartIds.has(part.id)) {
      return;
    }
    state.seenStepFinishPartIds.add(part.id);

    const eventKey = `step_finish:${part.id}`;

    console.info("OpenCode step finished", {
      todoId,
      sessionId,
      messageId: part.messageID,
      reason: part.reason,
    });
    if (onAppendTodoEvent) {
      await onAppendTodoEvent({
        eventKey,
        event: {
          kind: "step_finish",
          messageId: part.messageID,
          reason: part.reason,
        },
      });
    }
    return;
  }

  if (part.type === "tool") {
    const previousStatus = state.toolStateByCallId.get(part.callID);
    const nextStatus = part.state.status;
    if (previousStatus === nextStatus) {
      return;
    }
    state.toolStateByCallId.set(part.callID, nextStatus);

    if (!isToolEventStatus(nextStatus)) {
      return;
    }

    const eventKey = `tool:${part.callID}:${nextStatus}`;

    if (nextStatus === "running") {
      console.info("OpenCode tool started", {
        todoId,
        sessionId,
        tool: part.tool,
        title: part.state.title,
      });
      if (onAppendTodoEvent) {
        await onAppendTodoEvent({
          eventKey,
          event: {
            kind: "tool",
            tool: part.tool,
            status: "running",
            title: part.state.title,
          },
        });
      }
      return;
    }

    if (nextStatus === "completed") {
      console.info("OpenCode tool finished", {
        todoId,
        sessionId,
        tool: part.tool,
        title: part.state.title,
      });
      if (onAppendTodoEvent) {
        await onAppendTodoEvent({
          eventKey,
          event: {
            kind: "tool",
            tool: part.tool,
            status: "completed",
            title: part.state.title,
          },
        });
      }
      return;
    }

    if (nextStatus === "error") {
      console.warn("OpenCode tool failed", {
        todoId,
        sessionId,
        tool: part.tool,
        error: part.state.error,
      });
      if (onAppendTodoEvent) {
        const errorText = part.state.error
          ? getOpencodeErrorMessage(part.state.error)
          : "Unknown tool error";
        const title =
          "title" in part.state &&
          part.state.title !== undefined &&
          part.state.title !== null
            ? String(part.state.title)
            : undefined;
        await onAppendTodoEvent({
          eventKey,
          event: {
            kind: "tool",
            tool: part.tool,
            status: "error",
            title,
            error: errorText,
          },
        });
      }
    }
    return;
  }

  if (part.type === "patch") {
    if (state.seenPatchPartIds.has(part.id)) {
      return;
    }
    state.seenPatchPartIds.add(part.id);

    const eventKey = `patch:${part.id}`;
    const files = part.files.slice(0, 100);

    console.info("OpenCode patch created", {
      todoId,
      sessionId,
      fileCount: part.files.length,
      files: part.files.slice(0, 5),
    });
    if (onAppendTodoEvent) {
      await onAppendTodoEvent({
        eventKey,
        event: { kind: "patch", fileCount: part.files.length, files },
      });
    }
    return;
  }

  if (part.type === "compaction") {
    if (state.seenCompactionPartIds.has(part.id)) {
      return;
    }
    state.seenCompactionPartIds.add(part.id);

    const eventKey = `compaction:${part.id}`;

    console.info("OpenCode compaction created", {
      todoId,
      sessionId,
      auto: part.auto,
    });
    if (onAppendTodoEvent) {
      await onAppendTodoEvent({
        eventKey,
        event: { kind: "compaction", auto: part.auto },
      });
    }
    return;
  }

  if (part.type === "subtask") {
    if (state.seenSubtaskPartIds.has(part.id)) {
      return;
    }
    state.seenSubtaskPartIds.add(part.id);

    const eventKey = `subtask:${part.id}`;

    console.info("OpenCode subtask started", {
      todoId,
      sessionId,
      agent: part.agent,
      description: part.description,
    });
    if (onAppendTodoEvent) {
      await onAppendTodoEvent({
        eventKey,
        event: {
          kind: "subtask",
          agent: part.agent,
          description: part.description,
        },
      });
    }
  }
}

export async function waitForOpencodeTerminalState(
  client: OpencodeClient,
  sessionId: string,
  todoId: string,
  options: {
    timeoutMs?: number;
    onAppendTodoEvent?: AppendTodoEventCallback;
  } = {},
): Promise<WaitForOpencodeTerminalStateResult> {
  const abortController =
    typeof options.timeoutMs === "number" ? new AbortController() : null;
  const timeoutId =
    abortController && options.timeoutMs
      ? setTimeout(() => abortController.abort(), options.timeoutMs)
      : null;

  let lastSseErrorMessage: string | undefined;

  try {
    const eventStream = await client.event.subscribe(
      {},
      {
        onSseError: (error) => {
          const message = getOpencodeErrorMessage(error);
          lastSseErrorMessage = message;
          if (
            abortController?.signal.aborted &&
            message === "This operation was aborted"
          ) {
            return;
          }
          console.warn("OpenCode event stream error", {
            todoId,
            sessionId,
            error: message,
          });
        },
        signal: abortController?.signal,
        sseMaxRetryAttempts: OPENCODE_EVENT_MAX_RETRY_ATTEMPTS,
      },
    );

    const logState: OpencodeStreamLogState = {
      sessionCompactedSeq: 0,
      seenCompactionPartIds: new Set(),
      seenPatchPartIds: new Set(),
      seenStepFinishPartIds: new Set(),
      seenStepStartPartIds: new Set(),
      seenSubtaskPartIds: new Set(),
      toolStateByCallId: new Map(),
    };

    for await (const event of eventStream.stream) {
      await logOpencodeMilestone(
        event,
        logState,
        sessionId,
        todoId,
        options.onAppendTodoEvent,
      );

      const terminal = getTerminalResultForEvent(event, sessionId);
      if (terminal) {
        console.info("OpenCode SSE reached terminal state", {
          todoId,
          sessionId,
          terminalState: terminal.terminalState,
          terminalReason: terminal.terminalReason,
        });
        return { kind: "terminal", ...terminal };
      }
    }

    if (
      lastSseErrorMessage &&
      isUnrecoverableSseErrorMessage(lastSseErrorMessage)
    ) {
      const terminal = {
        terminalAt: Date.now(),
        terminalReason: `OpenCode event stream failed: ${lastSseErrorMessage}`,
        terminalState: "FAILED" as const,
      };

      console.warn("OpenCode SSE stream unrecoverable, finalizing as FAILED", {
        todoId,
        sessionId,
        terminalReason: terminal.terminalReason,
      });

      return { kind: "terminal", ...terminal };
    }
  } catch (error) {
    if (!abortController?.signal.aborted) {
      throw error;
    }
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }

  const status = await client.session.status();
  const sessionStatus = status.data?.[sessionId];
  if (sessionStatus?.type === "idle") {
    const terminal = {
      terminalAt: Date.now(),
      terminalReason: "Detected idle status during fallback status check",
      terminalState: "COMPLETED" as const,
    };

    console.info("OpenCode status fallback reached terminal state", {
      todoId,
      sessionId,
      terminalState: terminal.terminalState,
      terminalReason: terminal.terminalReason,
    });

    return { kind: "terminal", ...terminal };
  }

  console.info("OpenCode monitor slice handing off for retry", {
    todoId,
    sessionId,
    sessionStatus: sessionStatus?.type ?? "unknown",
  });

  return { kind: "retry" };
}
