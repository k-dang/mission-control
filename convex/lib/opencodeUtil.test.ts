import { describe, expect, it, vi } from "vitest";
import { waitForOpencodeTerminalState } from "./opencodeUtil";

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
      terminalAt: 1234,
      terminalState: "COMPLETED",
    });
  });

  it("returns null when the stream ends without a terminal classification", async () => {
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
    ).resolves.toBeNull();
  });
});
