import { describe, expect, it, vi } from "vitest";
import type { Event } from "@opencode-ai/sdk/v2";
import {
  isUnrecoverableSseErrorMessage,
  type AppendTodoEventCallback,
  waitForOpencodeTerminalState,
} from "./opencodeStreamMonitor";

type MockEvent = Event;

function createClient(events: MockEvent[]) {
  return {
    global: {
      event: vi.fn(async () => ({
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
    global: {
      event: vi.fn(
        async (opts?: { onSseError?: (error: unknown) => void }) => {
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
        id: "status_1",
        type: "session.status",
        properties: {
          sessionID: "session_123",
          status: { type: "idle" },
        },
      },
    ]);

    await expect(
      waitForOpencodeTerminalState(client, "session_123", "todo_123"),
    ).resolves.toEqual({
      kind: "terminal",
      terminalAt: 1234,
      terminalState: "COMPLETED",
    });
  });

  it("still returns COMPLETED when a session.next event was observed before terminal state", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);

    const client = createClient([
      {
        id: "step_1",
        type: "session.next.step.started",
        properties: {
          timestamp: 1234,
          sessionID: "session_123",
          agent: "build",
          model: {
            id: "gpt-5.1",
            providerID: "openai",
            variant: "default",
          },
        },
      },
      {
        id: "idle_1",
        type: "session.idle",
        properties: {
          sessionID: "session_123",
        },
      },
    ]);

    await expect(
      waitForOpencodeTerminalState(client, "session_123", "todo_123"),
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
        id: "error_1",
        type: "session.error",
        properties: {
          sessionID: "session_123",
          error: {
            name: "UnknownError",
            data: { message: "upstream failed" },
          },
        },
      },
    ]);

    await expect(
      waitForOpencodeTerminalState(client, "session_123", "todo_123"),
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
          id: "status_1",
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
      waitForOpencodeTerminalState(client, "session_123", "todo_123"),
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
          id: "status_1",
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
      waitForOpencodeTerminalState(client, "session_123", "todo_123"),
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
        id: "status_1",
        type: "session.status",
        properties: {
          sessionID: "session_123",
          status: { type: "busy" },
        },
      },
      {
        id: "step_1",
        type: "session.next.step.started",
        properties: {
          timestamp: 1234,
          sessionID: "session_123",
          agent: "build",
          model: {
            id: "gpt-5.1",
            providerID: "openai",
            variant: "default",
          },
        },
      },
    ]);

    await expect(
      waitForOpencodeTerminalState(client, "session_123", "todo_123"),
    ).resolves.toEqual({ kind: "retry" });
  });

  it("returns retry when the monitor slice aborts before terminal and fallback is not idle", async () => {
    vi.useFakeTimers();
    const client = {
      global: {
        event: vi.fn(
          async (opts?: { signal?: AbortSignal }) => ({
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
              const idleEvent: MockEvent = {
                id: "status_1",
                type: "session.status",
                properties: {
                  sessionID: "session_123",
                  status: { type: "idle" },
                },
              };
              yield idleEvent;
            })(),
          }),
        ),
      },
      session: {
        status: vi.fn(async () => ({
          data: { session_123: { type: "busy" } },
        })),
      },
    };

    try {
      const outcome = waitForOpencodeTerminalState(
        client,
        "session_123",
        "todo_123",
      );
      await vi.advanceTimersByTimeAsync(120_000);
      await expect(outcome).resolves.toEqual({ kind: "retry" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("calls onAppendTodoEvent for session.next step and tool events", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);
    const onAppendTodoEvent = vi.fn<AppendTodoEventCallback>(async () => {});

    const client = createClient([
      {
        id: "step_1",
        type: "session.next.step.started",
        properties: {
          timestamp: 1234,
          sessionID: "session_123",
          agent: "build",
          model: {
            id: "gpt-5.1",
            providerID: "openai",
            variant: "default",
          },
        },
      },
      {
        id: "tool_input_1",
        type: "session.next.tool.input.started",
        properties: {
          timestamp: 1235,
          sessionID: "session_123",
          callID: "call_1",
          name: "edit",
        },
      },
      {
        id: "tool_called_1",
        type: "session.next.tool.called",
        properties: {
          timestamp: 1236,
          sessionID: "session_123",
          callID: "call_1",
          tool: "edit",
          input: { file: "src/a.ts" },
          provider: { executed: true },
        },
      },
      {
        id: "tool_success_1",
        type: "session.next.tool.success",
        properties: {
          timestamp: 1237,
          sessionID: "session_123",
          callID: "call_1",
          structured: {},
          content: [],
          provider: { executed: true },
        },
      },
      {
        id: "idle_1",
        type: "session.idle",
        properties: {
          sessionID: "session_123",
        },
      },
    ]);

    await waitForOpencodeTerminalState(
      client,
      "session_123",
      "todo_123",
      onAppendTodoEvent,
    );

    expect(onAppendTodoEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "step_start:step_1",
        event: {
          kind: "step_start",
          messageId: "step_1",
          agent: "build",
          model: "openai/gpt-5.1",
        },
      }),
    );
    expect(onAppendTodoEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "tool:call_1:running",
        event: {
          kind: "tool",
          tool: "edit",
          status: "running",
        },
      }),
    );
    expect(onAppendTodoEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "tool:call_1:completed",
        event: {
          kind: "tool",
          tool: "edit",
          status: "completed",
        },
      }),
    );
  });

  it("calls onAppendTodoEvent for live message part step and tool events", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);
    const onAppendTodoEvent = vi.fn<AppendTodoEventCallback>(async () => {});

    const client = createClient([
      {
        id: "part_step_start",
        type: "message.part.updated",
        properties: {
          sessionID: "session_123",
          time: 1234,
          part: {
            id: "part_1",
            type: "step-start",
            messageID: "message_1",
            sessionID: "session_123",
          },
        },
      },
      {
        id: "part_tool_running",
        type: "message.part.updated",
        properties: {
          sessionID: "session_123",
          time: 1235,
          part: {
            id: "part_2",
            type: "tool",
            tool: "bash",
            callID: "call_1",
            messageID: "message_1",
            sessionID: "session_123",
            state: {
              status: "running",
              input: {},
              time: { start: 1235 },
            },
          },
        },
      },
      {
        id: "part_tool_done",
        type: "message.part.updated",
        properties: {
          sessionID: "session_123",
          time: 1236,
          part: {
            id: "part_2",
            type: "tool",
            tool: "bash",
            callID: "call_1",
            messageID: "message_1",
            sessionID: "session_123",
            state: {
              status: "completed",
              input: {},
              output: "ok",
              title: "Run shell",
              metadata: {},
              time: { start: 1235, end: 1236 },
            },
          },
        },
      },
      {
        id: "part_step_finish",
        type: "message.part.updated",
        properties: {
          sessionID: "session_123",
          time: 1237,
          part: {
            id: "part_3",
            type: "step-finish",
            messageID: "message_1",
            sessionID: "session_123",
            reason: "tool-calls",
            tokens: {
              input: 0,
              output: 0,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
            cost: 0,
          },
        },
      },
      {
        id: "idle_1",
        type: "session.idle",
        properties: {
          sessionID: "session_123",
        },
      },
    ]);

    await waitForOpencodeTerminalState(
      client,
      "session_123",
      "todo_123",
      onAppendTodoEvent,
    );

    expect(onAppendTodoEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "step_start:part_1",
        event: {
          kind: "step_start",
          messageId: "message_1",
        },
      }),
    );
    expect(onAppendTodoEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "tool:call_1:completed",
        event: {
          kind: "tool",
          tool: "bash",
          status: "completed",
          title: "Run shell",
        },
      }),
    );
    expect(onAppendTodoEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "step_finish:part_3",
        event: {
          kind: "step_finish",
          messageId: "message_1",
          reason: "tool-calls",
        },
      }),
    );
  });

  it("calls onAppendTodoEvent for session.next step finish and compaction", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);
    const onAppendTodoEvent = vi.fn<AppendTodoEventCallback>(async () => {});

    const client = createClient([
      {
        id: "finish_1",
        type: "session.next.step.ended",
        properties: {
          timestamp: 1235,
          sessionID: "session_123",
          finish: "stop",
          cost: 0,
          tokens: {
            input: 0,
            output: 0,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
        },
      },
      {
        id: "compact_1",
        type: "session.next.compaction.started",
        properties: {
          timestamp: 1236,
          sessionID: "session_123",
          reason: "auto",
        },
      },
      {
        id: "compact_2",
        type: "session.next.compaction.ended",
        properties: {
          timestamp: 1237,
          sessionID: "session_123",
          text: "Summarized prior work",
        },
      },
      {
        id: "idle_1",
        type: "session.idle",
        properties: {
          sessionID: "session_123",
        },
      },
    ]);

    await waitForOpencodeTerminalState(
      client,
      "session_123",
      "todo_123",
      onAppendTodoEvent,
    );

    expect(onAppendTodoEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "step_finish:finish_1",
        event: {
          kind: "step_finish",
          messageId: "finish_1",
          reason: "stop",
        },
      }),
    );
    expect(onAppendTodoEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "compaction:compact_1:started",
        event: {
          kind: "compaction",
          auto: true,
        },
      }),
    );
    expect(onAppendTodoEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "compaction:compact_2:ended",
        event: {
          kind: "compaction",
          auto: true,
          summary: "Summarized prior work",
        },
      }),
    );
  });
});

