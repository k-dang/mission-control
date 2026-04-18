import { describe, expect, it, vi } from "vitest";
import {
  buildOpencodeConfigJson,
  isUnrecoverableSseErrorMessage,
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
  };
}

function createClientWithSseError(events: MockEvent[], sseErrorMessage: string) {
  return {
    event: {
      subscribe: vi.fn(
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

describe("buildOpencodeConfigJson", () => {
  it("includes both the primary and small model when provided", () => {
    const config = JSON.parse(
      buildOpencodeConfigJson(
        "test-key",
        "moonshotai/kimi-k2.5",
        "openai/gpt-5-mini",
      ),
    ) as {
      model: string;
      provider: { vercel: { models: Record<string, unknown> } };
      small_model?: string;
    };

    expect(config.model).toBe("moonshotai/kimi-k2.5");
    expect(config.small_model).toBe("openai/gpt-5-mini");
    expect(Object.keys(config.provider.vercel.models)).toEqual([
      "moonshotai/kimi-k2.5",
      "openai/gpt-5-mini",
    ]);
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
      outcome: {
        terminal: {
          terminalAt: 1234,
          terminalState: "COMPLETED",
        },
      },
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
      outcome: {
        terminal: {
          terminalAt: 1234,
          terminalState: "COMPLETED",
        },
      },
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
      outcome: {
        terminal: {
          terminalAt: 9999,
          terminalReason: "upstream failed",
          terminalState: "FAILED",
        },
      },
    });
  });

  it("returns stream_unrecoverable when SSE reports 410 Gone and stream ends without terminal", async () => {
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
      kind: "stream_unrecoverable",
      reason: "SSE failed: 410 Gone",
    });
  });

  it("returns handoff when the stream ends without a terminal classification", async () => {
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
    ).resolves.toEqual({ kind: "handoff" });
  });

  it("returns slice_timeout when the monitor slice aborts before terminal", async () => {
    const client = {
      event: {
        subscribe: vi.fn(async (opts?: { signal?: AbortSignal }) => ({
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
    };

    await expect(
      waitForOpencodeTerminalState(client as never, "session_123", "todo_123", {
        timeoutMs: 80,
      }),
    ).resolves.toEqual({ kind: "slice_timeout" });
  });
});
