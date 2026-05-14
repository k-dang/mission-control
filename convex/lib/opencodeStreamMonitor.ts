import type { Event, GlobalEvent } from "@opencode-ai/sdk/v2";

import { OpencodeTodoEventProjector } from "./opencodeEventProjector";
import type { TodoEventInput } from "./todoEventValidator";

const OPENCODE_EVENT_MAX_RETRY_ATTEMPTS = 5;
const OPENCODE_MONITOR_SLICE_MS = 120_000;

type TerminalState = "COMPLETED" | "FAILED" | "CANCELLED";

export type TerminalResult = {
  terminalAt: number;
  terminalReason?: string;
  terminalState: TerminalState;
};

export type OpencodeWaitOutcome =
  | ({ kind: "terminal" } & TerminalResult)
  | { kind: "retry" };

type OpencodeEventClient = {
  global: {
    event: (
      options?: {
        onSseError?: (error: unknown) => void;
        signal?: AbortSignal;
        sseMaxRetryAttempts?: number;
      },
    ) => Promise<{ stream: AsyncIterable<Event | GlobalEvent> }>;
  };
  session: {
    status: () => Promise<{
      data?: Record<string, { type?: string }>;
    }>;
  };
};

export type AppendTodoEventCallback = (input: TodoEventInput) => Promise<void>;

const defaultAppendTodoEvent: AppendTodoEventCallback = async () => {};

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
      terminalReason: !error
        ? "OpenCode session ended with an unknown error"
        : error.name === "MessageOutputLengthError"
          ? "OpenCode message exceeded output length"
          : error.data.message,
      terminalState: "FAILED",
    };
  }

  return null;
}

export async function waitForOpencodeTerminalState(
  client: OpencodeEventClient,
  sessionId: string,
  todoId: string,
  onAppendTodoEvent: AppendTodoEventCallback = defaultAppendTodoEvent,
): Promise<OpencodeWaitOutcome> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(
    () => abortController.abort(),
    OPENCODE_MONITOR_SLICE_MS,
  );

  let lastSseErrorMessage: string | undefined;

  try {
    const eventStream = await client.global.event({
      onSseError: (error) => {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Unknown error";
        lastSseErrorMessage = message;
        if (
          abortController.signal.aborted &&
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
      signal: abortController.signal,
      sseMaxRetryAttempts: OPENCODE_EVENT_MAX_RETRY_ATTEMPTS,
    });

    const projector = new OpencodeTodoEventProjector(sessionId);

    for await (const streamEvent of eventStream.stream) {
      const event =
        "payload" in streamEvent ? (streamEvent.payload as Event) : streamEvent;

      for (const todoEvent of projector.project(event)) {
        await onAppendTodoEvent(todoEvent);
      }

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
    if (!abortController.signal.aborted) {
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
