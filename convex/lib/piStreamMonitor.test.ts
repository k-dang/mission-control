import { describe, expect, it, vi } from "vitest";
import {
  type AppendTodoEventCallback,
  failPiAttemptForBudgetExhaustion,
  type PiCommandClient,
  type PiCommandLogChunk,
  waitForPiTerminalState,
} from "./piStreamMonitor";

function createClient(
  chunks: PiCommandLogChunk[],
  opts?: { exitCode?: number; kill?: () => Promise<void> },
): PiCommandClient {
  return {
    logs: vi.fn((logOpts?: { signal?: AbortSignal }) =>
      (async function* () {
        for (const chunk of chunks) {
          if (logOpts?.signal?.aborted) return;
          yield chunk;
        }
      })(),
    ),
    wait: vi.fn(async () => ({ exitCode: opts?.exitCode ?? 0 })),
    kill: opts?.kill ?? vi.fn(async () => {}),
  };
}

function stdout(data: string): PiCommandLogChunk {
  return { data, stream: "stdout" };
}

function stderr(data: string): PiCommandLogChunk {
  return { data, stream: "stderr" };
}

describe("waitForPiTerminalState", () => {
  it("returns COMPLETED when the command exits 0", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);
    const client = createClient([
      stdout('{"type":"turn_start"}\n'),
      stdout(
        '{"type":"turn_end","message":{"role":"assistant","stopReason":"stop"},"toolResults":[]}\n',
      ),
    ]);

    await expect(
      waitForPiTerminalState(client, "todo_123"),
    ).resolves.toEqual({ kind: "terminal", terminalAt: 1234, terminalState: "COMPLETED" });
  });

  it("fails when Pi reports a terminal assistant error despite exit code 0", async () => {
    vi.spyOn(Date, "now").mockReturnValue(4321);
    const client = createClient([
      stdout(
        '{"type":"agent_end","willRetry":false,"messages":[{"role":"assistant","stopReason":"error","errorMessage":"provider failed"}]}\n',
      ),
    ]);

    await expect(waitForPiTerminalState(client, "todo_123")).resolves.toEqual({
      kind: "terminal",
      terminalAt: 4321,
      terminalReason: "provider failed",
      terminalState: "FAILED",
    });
  });

  it("parses JSON lines split across command-log chunks", async () => {
    const onAppendTodoEvent = vi.fn<AppendTodoEventCallback>(async () => {});
    const client = createClient([
      stdout('{"type":"turn_st'),
      stdout(
        'art"}\n{"type":"turn_end","message":{"role":"assistant","stopReason":"stop"},"toolResults":[]}\n',
      ),
    ]);

    await waitForPiTerminalState(client, "todo_123", onAppendTodoEvent);

    expect(onAppendTodoEvent).toHaveBeenCalledWith({
      eventKey: "step_start:0",
      event: { kind: "step_start", messageId: "pi:0" },
    });
    expect(onAppendTodoEvent).toHaveBeenCalledWith({
      eventKey: "step_finish:1",
      event: { kind: "step_finish", messageId: "pi:1", reason: "stop" },
    });
  });

  it("projects a valid final JSON line without a trailing newline", async () => {
    const onAppendTodoEvent = vi.fn<AppendTodoEventCallback>(async () => {});
    const client = createClient([stdout('{"type":"turn_start"}')]);

    await expect(
      waitForPiTerminalState(client, "todo_123", onAppendTodoEvent),
    ).resolves.toMatchObject({ kind: "terminal", terminalState: "COMPLETED" });
    expect(onAppendTodoEvent).toHaveBeenCalledWith({
      eventKey: "step_start:0",
      event: { kind: "step_start", messageId: "pi:0" },
    });
  });

  it("produces identical event keys when the same command log is replayed", async () => {
    const chunks = [
      stdout('{"type":"turn_start"}\n'),
      stdout(
        '{"type":"tool_execution_start","toolCallId":"call_1","toolName":"edit","args":{}}\n',
      ),
      stdout(
        '{"type":"tool_execution_end","toolCallId":"call_1","toolName":"edit","result":{},"isError":false}\n',
      ),
      stdout(
        '{"type":"turn_end","message":{"role":"assistant","stopReason":"stop"},"toolResults":[]}\n',
      ),
    ];

    const firstPass: string[] = [];
    await waitForPiTerminalState(createClient(chunks), "todo_123", async (event) => {
      firstPass.push(event.eventKey);
    });

    const secondPass: string[] = [];
    await waitForPiTerminalState(createClient(chunks), "todo_123", async (event) => {
      secondPass.push(event.eventKey);
    });

    expect(secondPass).toEqual(firstPass);
    expect(firstPass).toEqual([
      "step_start:0",
      "tool:call_1:running",
      "tool:call_1:completed",
      "step_finish:3",
    ]);
  });

  it("treats stderr as diagnostic-only and never projects it as an Attempt Event", async () => {
    const onAppendTodoEvent = vi.fn<AppendTodoEventCallback>(async () => {});
    const client = createClient([
      stderr('{"type":"turn_start"}\n'),
      stdout('{"type":"turn_start"}\n'),
      stdout(
        '{"type":"turn_end","message":{"role":"assistant","stopReason":"stop"},"toolResults":[]}\n',
      ),
    ]);

    await waitForPiTerminalState(client, "todo_123", onAppendTodoEvent);

    expect(onAppendTodoEvent).toHaveBeenCalledTimes(2);
  });

  it("fails the Attempt and includes a stderr tail for a nonzero exit", async () => {
    vi.spyOn(Date, "now").mockReturnValue(5555);
    const killSpy = vi.fn(async () => {});
    const client = createClient(
      [stderr("panic: something broke"), stdout('{"type":"turn_start"}\n')],
      { exitCode: 1, kill: killSpy },
    );

    await expect(waitForPiTerminalState(client, "todo_123")).resolves.toEqual({
      kind: "terminal",
      terminalAt: 5555,
      terminalReason: "Pi exited with code 1: panic: something broke",
      terminalState: "FAILED",
    });
    // The process already exited on its own; nothing to best-effort terminate.
    expect(killSpy).not.toHaveBeenCalled();
  });

  it("fails the Attempt on malformed stdout and best-effort terminates the process", async () => {
    vi.spyOn(Date, "now").mockReturnValue(9999);
    const killSpy = vi.fn(async () => {});
    const onAppendTodoEvent = vi.fn<AppendTodoEventCallback>(async () => {});
    const client = createClient(
      [stdout('{"type":"turn_start"}\nnot json at all\n{"type":"turn_start"}\n')],
      { kill: killSpy },
    );

    await expect(
      waitForPiTerminalState(client, "todo_123", onAppendTodoEvent),
    ).resolves.toEqual({
      kind: "terminal",
      terminalAt: 9999,
      terminalReason: "Malformed Pi JSON stdout at line 2",
      terminalState: "FAILED",
    });

    // Only the valid line before the malformed one was projected.
    expect(onAppendTodoEvent).toHaveBeenCalledTimes(1);
    expect(killSpy).toHaveBeenCalledTimes(1);
  });

  it("redacts malformed final stdout without a trailing newline", async () => {
    vi.spyOn(Date, "now").mockReturnValue(9998);
    const leaked = 'assistant secret and tool args {"token":"abc"';
    const client = createClient([stdout(leaked)]);

    const outcome = await waitForPiTerminalState(client, "todo_123");

    expect(outcome).toEqual({
      kind: "terminal",
      terminalAt: 9998,
      terminalReason: "Malformed Pi JSON stdout at line 1",
      terminalState: "FAILED",
    });
    expect(JSON.stringify(outcome)).not.toContain(leaked);
    expect(JSON.stringify(outcome)).not.toContain("token");
  });

  it("hands off for replay when persisting an Attempt Event fails", async () => {
    const killSpy = vi.fn(async () => {});
    const client = createClient([stdout('{"type":"turn_start"}\n')], {
      kill: killSpy,
    });

    await expect(
      waitForPiTerminalState(client, "todo_123", async () => {
        throw new Error("transient Convex write failure");
      }),
    ).resolves.toEqual({ kind: "retry" });
    expect(client.wait).not.toHaveBeenCalled();
    expect(killSpy).not.toHaveBeenCalled();
  });

  it("fails the Attempt and best-effort terminates the process when the log stream is lost", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2222);
    const killSpy = vi.fn(async () => {});
    const client: PiCommandClient = {
      logs: vi.fn(() =>
        (async function* (): AsyncGenerator<PiCommandLogChunk> {
          throw new Error("connection reset");
        })(),
      ),
      wait: vi.fn(async () => ({ exitCode: 0 })),
      kill: killSpy,
    };

    await expect(waitForPiTerminalState(client, "todo_123")).resolves.toEqual({
      kind: "terminal",
      terminalAt: 2222,
      terminalReason: "Lost Pi command stream: connection reset",
      terminalState: "FAILED",
    });
    expect(killSpy).toHaveBeenCalledTimes(1);
  });

  it("returns retry when the slice budget elapses and the process is still running", async () => {
    vi.useFakeTimers();
    const killSpy = vi.fn(async () => {});
    const client: PiCommandClient = {
      logs: vi.fn(
        (opts?: { signal?: AbortSignal }) =>
          (async function* (): AsyncGenerator<PiCommandLogChunk> {
            await new Promise<void>((_, reject) => {
              const signal = opts?.signal;
              if (!signal) {
                reject(new Error("expected signal"));
                return;
              }
              if (signal.aborted) {
                reject(new DOMException("Aborted", "AbortError"));
                return;
              }
              signal.addEventListener("abort", () => {
                reject(new DOMException("Aborted", "AbortError"));
              });
            });
          })(),
      ),
      wait: vi.fn(async () => ({ exitCode: 0 })),
      kill: killSpy,
    };

    try {
      const outcome = waitForPiTerminalState(client, "todo_123");
      await vi.advanceTimersByTimeAsync(120_000);
      await expect(outcome).resolves.toEqual({ kind: "retry" });
    } finally {
      vi.useRealTimers();
    }

    // A slice timeout is not a failure; nothing should be terminated.
    expect(killSpy).not.toHaveBeenCalled();
  });

  it("fails the Attempt when the exit status cannot be resolved after the stream ends", async () => {
    vi.spyOn(Date, "now").mockReturnValue(7777);
    const client: PiCommandClient = {
      logs: vi.fn(() =>
        (async function* (): AsyncGenerator<PiCommandLogChunk> {
          yield stdout('{"type":"turn_start"}\n');
        })(),
      ),
      wait: vi.fn(async () => {
        throw new Error("command not found");
      }),
      kill: vi.fn(async () => {}),
    };

    await expect(waitForPiTerminalState(client, "todo_123")).resolves.toEqual({
      kind: "terminal",
      terminalAt: 7777,
      terminalReason: "Failed to resolve Pi exit status: command not found",
      terminalState: "FAILED",
    });
  });

  it("ignores unknown Pi event types while still reaching a terminal state", async () => {
    const onAppendTodoEvent = vi.fn<AppendTodoEventCallback>(async () => {});
    const client = createClient([
      stdout('{"type":"session","version":3,"id":"abc","timestamp":"now","cwd":"/repo"}\n'),
      stdout('{"type":"agent_start"}\n'),
      stdout(
        '{"type":"turn_end","message":{"role":"assistant","stopReason":"stop"},"toolResults":[]}\n',
      ),
    ]);

    await waitForPiTerminalState(client, "todo_123", onAppendTodoEvent);

    expect(onAppendTodoEvent).toHaveBeenCalledTimes(1);
    expect(onAppendTodoEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: "step_finish:2" }),
    );
  });
});

describe("failPiAttemptForBudgetExhaustion", () => {
  it("best-effort terminates the Pi process and fails the Attempt with a duration reason", async () => {
    vi.spyOn(Date, "now").mockReturnValue(3333);
    const killSpy = vi.fn(async () => {});
    const client: PiCommandClient = {
      logs: vi.fn(() => (async function* (): AsyncGenerator<PiCommandLogChunk> {})()),
      wait: vi.fn(async () => ({ exitCode: 0 })),
      kill: killSpy,
    };

    await expect(
      failPiAttemptForBudgetExhaustion(client, "todo_123", 30 * 60_000),
    ).resolves.toEqual({
      terminalAt: 3333,
      terminalReason: "Attempt exceeded the maximum duration of 30 minutes",
      terminalState: "FAILED",
    });
    expect(killSpy).toHaveBeenCalledTimes(1);
  });

  it("still fails the Attempt when the best-effort kill itself fails", async () => {
    vi.spyOn(Date, "now").mockReturnValue(4444);
    const client: PiCommandClient = {
      logs: vi.fn(() => (async function* (): AsyncGenerator<PiCommandLogChunk> {})()),
      wait: vi.fn(async () => ({ exitCode: 0 })),
      kill: vi.fn(async () => {
        throw new Error("process already exited");
      }),
    };

    await expect(
      failPiAttemptForBudgetExhaustion(client, "todo_123", 45 * 60_000),
    ).resolves.toEqual({
      terminalAt: 4444,
      terminalReason: "Attempt exceeded the maximum duration of 45 minutes",
      terminalState: "FAILED",
    });
  });
});
