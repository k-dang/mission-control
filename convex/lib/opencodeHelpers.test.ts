import { describe, expect, it, vi } from "vitest";
import {
  isUnrecoverableSseErrorMessage,
  type AppendTodoEventCallback,
  waitForOpencodeTerminalState,
} from "./opencodeHelpers";

type MockEvent = {
  type: string;
  properties: Record<string, unknown>;
};

function createClient(events: MockEvent[]) {
  return {
    event: {
      subscribe: vi.fn(async () => ({
        stream: (async function* () {
          for (const event of events) {
            yield event;
          }
        })(),
      })),
    },
    session: {
      status: vi.fn(async () => ({ data: {} })),
    },
  };
}

function createClientWithSseError(
  events: MockEvent[],
  sseErrorMessage: string,
  sessionStatusData: Record<string, { type: string }> = {},
) {
  return {
    event: {
      subscribe: vi.fn(
        async (
          _params?: unknown,
          opts?: { onSseError?: (error: unknown) => void },
        ) => {
          opts?.onSseError?.(new Error(sseErrorMessage));
          return {
            stream: (async function* () {
              for (const event of events) {
                yield event;
              }
            })(),
          };
        },
      ),
    },
    session: {
      status: vi.fn(async () => ({ data: sessionStatusData })),
    },
  };
}

describe("isUnrecoverableSseErrorMessage", () => {
  it("detects 410 Gone style messages", () => {
    expect(isUnrecoverableSseErrorMessage("SSE failed: 410 Gone")).toBe(true);
  });

  it("returns false for generic transient errors", () => {
    expect(isUnrecoverableSseErrorMessage("connection reset")).toBe(false);
  });
});

describe("waitForOpencodeTerminalState", () => {
  it("returns COMPLETED for an idle terminal event", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);

    const client = createClient([
      {
        type: "session.status",
        properties: {
          sessionID: "session_123",
          status: { type: "idle" },
        },
      },
    ]);

    await expect(
      waitForOpencodeTerminalState(client as never, "session_123", "todo_123"),
    ).resolves.toEqual({
      kind: "terminal",
      terminalAt: 1234,
      terminalState: "COMPLETED",
    });
  });

  it("still returns COMPLETED when a patch part was observed before terminal state", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);

    const client = createClient([
      {
        type: "message.part.updated",
        properties: {
          part: {
            id: "patch_1",
            sessionID: "session_123",
            messageID: "message_1",
            type: "patch",
            hash: "abc123",
            files: ["src/foo.ts"],
          },
        },
      },
      {
        type: "session.idle",
        properties: {
          sessionID: "session_123",
        },
      },
    ]);

    await expect(
      waitForOpencodeTerminalState(client as never, "session_123", "todo_123"),
    ).resolves.toEqual({
      kind: "terminal",
      terminalAt: 1234,
      terminalState: "COMPLETED",
    });
  });

  it("returns FAILED for session.error with a non-abort error", async () => {
    vi.spyOn(Date, "now").mockReturnValue(9999);

    const client = createClient([
      {
        type: "session.error",
        properties: {
          sessionID: "session_123",
          error: new Error("upstream failed"),
        },
      },
    ]);

    await expect(
      waitForOpencodeTerminalState(client as never, "session_123", "todo_123"),
    ).resolves.toEqual({
      kind: "terminal",
      terminalAt: 9999,
      terminalReason: "upstream failed",
      terminalState: "FAILED",
    });
  });

  it("returns FAILED terminal when SSE reports 410 Gone and stream ends without terminal", async () => {
    vi.spyOn(Date, "now").mockReturnValue(5555);

    const client = createClientWithSseError(
      [
        {
          type: "session.status",
          properties: {
            sessionID: "session_123",
            status: { type: "busy" },
          },
        },
      ],
      "SSE failed: 410 Gone",
    );

    await expect(
      waitForOpencodeTerminalState(client as never, "session_123", "todo_123"),
    ).resolves.toEqual({
      kind: "terminal",
      terminalAt: 5555,
      terminalReason: "OpenCode event stream failed: SSE failed: 410 Gone",
      terminalState: "FAILED",
    });
  });

  it("returns terminal when fallback status sees idle after stream ends without a terminal classification", async () => {
    vi.spyOn(Date, "now").mockReturnValue(7777);

    const client = createClientWithSseError(
      [
        {
          type: "session.status",
          properties: {
            sessionID: "session_123",
            status: { type: "busy" },
          },
        },
      ],
      "connection reset",
      { session_123: { type: "idle" } },
    );

    await expect(
      waitForOpencodeTerminalState(client as never, "session_123", "todo_123"),
    ).resolves.toEqual({
      kind: "terminal",
      terminalAt: 7777,
      terminalReason: "Detected idle status during fallback status check",
      terminalState: "COMPLETED",
    });
  });

  it("returns retry when the stream ends without a terminal classification and fallback is still busy", async () => {
    const client = createClient([
      {
        type: "session.status",
        properties: {
          sessionID: "session_123",
          status: { type: "busy" },
        },
      },
      {
        type: "message.part.updated",
        properties: {
          part: {
            id: "part_1",
            sessionID: "session_123",
            type: "step-start",
            messageID: "message_1",
          },
        },
      },
    ]);

    await expect(
      waitForOpencodeTerminalState(client as never, "session_123", "todo_123"),
    ).resolves.toEqual({ kind: "retry" });
  });

  it("returns retry when the monitor slice aborts before terminal and fallback is not idle", async () => {
    vi.useFakeTimers();
    const client = {
      event: {
        subscribe: vi.fn(async (_params?: unknown, opts?: { signal?: AbortSignal }) => ({
          stream: (async function* () {
            await new Promise<void>((_, reject) => {
              const signal = opts?.signal;
              if (!signal) {
                reject(new Error("expected subscribe signal"));
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
            yield {
              type: "session.status",
              properties: {
                sessionID: "session_123",
                status: { type: "idle" },
              },
            };
          })(),
        })),
      },
      session: {
        status: vi.fn(async () => ({
          data: { session_123: { type: "busy" } },
        })),
      },
    };

    try {
      const outcome = waitForOpencodeTerminalState(
        client as never,
        "session_123",
        "todo_123",
      );
      await vi.advanceTimersByTimeAsync(120_000);
      await expect(outcome).resolves.toEqual({ kind: "retry" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("calls onAppendTodoEvent for patch with expected event key and file count", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);
    const onAppendTodoEvent = vi.fn<AppendTodoEventCallback>(async () => {});

    const client = createClient([
      {
        type: "message.part.updated",
        properties: {
          part: {
            id: "patch_1",
            sessionID: "session_123",
            messageID: "message_1",
            type: "patch",
            hash: "abc123",
            files: ["src/a.ts", "src/b.ts"],
          },
        },
      },
      {
        type: "session.idle",
        properties: {
          sessionID: "session_123",
        },
      },
    ]);

    await waitForOpencodeTerminalState(
      client as never,
      "session_123",
      "todo_123",
      onAppendTodoEvent,
    );

    expect(onAppendTodoEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "patch:patch_1",
        event: {
          kind: "patch",
          fileCount: 2,
          files: ["src/a.ts", "src/b.ts"],
        },
      }),
    );
  });

  it("dedupes onAppendTodoEvent for duplicate step-start in the same slice", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);
    const onAppendTodoEvent = vi.fn<AppendTodoEventCallback>(async () => {});

    const client = createClient([
      {
        type: "message.part.updated",
        properties: {
          part: {
            id: "s1",
            sessionID: "session_123",
            type: "step-start",
            messageID: "message_1",
          },
        },
      },
      {
        type: "message.part.updated",
        properties: {
          part: {
            id: "s1",
            sessionID: "session_123",
            type: "step-start",
            messageID: "message_1",
          },
        },
      },
      {
        type: "session.idle",
        properties: {
          sessionID: "session_123",
        },
      },
    ]);

    await waitForOpencodeTerminalState(
      client as never,
      "session_123",
      "todo_123",
      onAppendTodoEvent,
    );

    const stepStartCalls = onAppendTodoEvent.mock.calls.filter(
      (call) => call[0].eventKey === "step_start:s1",
    );
    expect(stepStartCalls).toHaveLength(1);
  });
});
