import { PiTodoEventProjector } from "./piEventProjector";
import type { TodoEventInput } from "./todoEventValidator";

export const PI_MONITOR_SLICE_MS = 120_000;
const MAX_STDERR_TAIL_CHARS = 2_000;

export type PiCommandLogChunk = { data: string; stream: "stdout" | "stderr" };

/**
 * Structural subset of `@vercel/sandbox`'s `Command`/`CommandFinished` that
 * the monitor needs. `logs()` restarts from the beginning of the command's
 * output every time it's called (there is no cursor param), so a monitor
 * slice always re-derives `lineSeq` from 0 and relies on
 * {@link PiTodoEventProjector}'s deterministic keys plus `todoEvents.append`
 * dedup to make replay idempotent.
 */
export type PiCommandClient = {
  logs(opts?: { signal?: AbortSignal }): AsyncIterable<PiCommandLogChunk>;
  wait(opts?: { signal?: AbortSignal }): Promise<{ exitCode: number }>;
  kill(): Promise<void>;
};

type PiTerminalState = "COMPLETED" | "FAILED";

export type PiTerminalResult = {
  terminalAt: number;
  terminalReason?: string;
  terminalState: PiTerminalState;
};

export type PiWaitOutcome =
  | ({ kind: "terminal" } & PiTerminalResult)
  | { kind: "retry" };

export type AppendTodoEventCallback = (input: TodoEventInput) => Promise<void>;

const defaultAppendTodoEvent: AppendTodoEventCallback = async () => {};

async function bestEffortKill(command: PiCommandClient, todoId: string) {
  try {
    await command.kill();
  } catch (error) {
    console.warn("Failed to best-effort terminate Pi process", { todoId, error });
  }
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function failPiAttemptForBudgetExhaustion(
  command: PiCommandClient,
  todoId: string,
  maxAttemptDurationMs: number,
): Promise<PiTerminalResult> {
  await bestEffortKill(command, todoId);
  return {
    terminalAt: Date.now(),
    terminalReason: `Attempt exceeded the maximum duration of ${Math.round(maxAttemptDurationMs / 60_000)} minutes`,
    terminalState: "FAILED",
  };
}

export async function waitForPiTerminalState(
  command: PiCommandClient,
  todoId: string,
  onAppendTodoEvent: AppendTodoEventCallback = defaultAppendTodoEvent,
  monitorForMs: number = PI_MONITOR_SLICE_MS,
): Promise<PiWaitOutcome> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(
    () => abortController.abort(),
    Math.max(1, monitorForMs),
  );

  const projector = new PiTodoEventProjector();
  let lineSeq = 0;
  let stdoutBuffer = "";
  let stderrTail = "";
  let malformedLineNumber: number | undefined;
  let lostStreamError: unknown;
  let eventPersistenceError: unknown;

  const processStdoutLine = async (line: string) => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return true;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmedLine);
    } catch {
      malformedLineNumber = lineSeq + 1;
      return false;
    }

    for (const todoEvent of projector.project(parsed, lineSeq)) {
      try {
        await onAppendTodoEvent(todoEvent);
      } catch (error) {
        eventPersistenceError = error;
        return false;
      }
    }
    lineSeq += 1;
    return true;
  };

  try {
    try {
      for await (const chunk of command.logs({ signal: abortController.signal })) {
        if (chunk.stream === "stderr") {
          stderrTail = (stderrTail + chunk.data).slice(-MAX_STDERR_TAIL_CHARS);
          continue;
        }

        stdoutBuffer += chunk.data;
        let cursor = 0;
        let newlineIndex = stdoutBuffer.indexOf("\n");
        while (newlineIndex !== -1) {
          const line = stdoutBuffer.slice(cursor, newlineIndex);
          cursor = newlineIndex + 1;

          if (!(await processStdoutLine(line))) break;

          newlineIndex = stdoutBuffer.indexOf("\n", cursor);
        }
        stdoutBuffer = stdoutBuffer.slice(cursor);

        if (
          malformedLineNumber !== undefined ||
          eventPersistenceError !== undefined
        ) {
          break;
        }
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        lostStreamError = error;
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }

  if (
    !abortController.signal.aborted &&
    lostStreamError === undefined &&
    malformedLineNumber === undefined &&
    eventPersistenceError === undefined &&
    stdoutBuffer.trim()
  ) {
    await processStdoutLine(stdoutBuffer);
  }

  if (eventPersistenceError !== undefined) {
    console.warn("Failed to persist Pi Attempt Event; handing off for replay", {
      todoId,
      error: eventPersistenceError,
    });
    return { kind: "retry" };
  }

  if (lostStreamError !== undefined) {
    await bestEffortKill(command, todoId);
    return {
      kind: "terminal",
      terminalAt: Date.now(),
      terminalReason: `Lost Pi command stream: ${describeError(lostStreamError)}`,
      terminalState: "FAILED",
    };
  }

  if (malformedLineNumber !== undefined) {
    await bestEffortKill(command, todoId);
    return {
      kind: "terminal",
      terminalAt: Date.now(),
      terminalReason: `Malformed Pi JSON stdout at line ${malformedLineNumber}`,
      terminalState: "FAILED",
    };
  }

  if (abortController.signal.aborted) {
    console.info("Pi monitor slice handing off for retry", { todoId });
    return { kind: "retry" };
  }

  // The log stream ended on its own (not via our abort), so the process has exited.
  try {
    const finished = await command.wait();
    if (finished.exitCode === 0) {
      const terminalFailureReason = projector.getTerminalFailureReason();
      if (terminalFailureReason) {
        return {
          kind: "terminal",
          terminalAt: Date.now(),
          terminalReason: terminalFailureReason,
          terminalState: "FAILED",
        };
      }
      return {
        kind: "terminal",
        terminalAt: Date.now(),
        terminalState: "COMPLETED",
      };
    }

    return {
      kind: "terminal",
      terminalAt: Date.now(),
      terminalReason: `Pi exited with code ${finished.exitCode}${
        stderrTail ? `: ${stderrTail}` : ""
      }`,
      terminalState: "FAILED",
    };
  } catch (error) {
    return {
      kind: "terminal",
      terminalAt: Date.now(),
      terminalReason: `Failed to resolve Pi exit status: ${describeError(error)}`,
      terminalState: "FAILED",
    };
  }
}
