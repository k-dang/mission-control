import { describe, expect, it } from "vitest";
import { PiTodoEventProjector } from "./piEventProjector";

describe("PiTodoEventProjector", () => {
  it("projects turn_start as a step_start milestone", () => {
    const projector = new PiTodoEventProjector();
    expect(projector.project({ type: "turn_start" }, 3)).toEqual([
      {
        eventKey: "step_start:3",
        event: { kind: "step_start", messageId: "pi:3" },
      },
    ]);
  });

  it("projects turn_end as a step_finish milestone with the assistant stop reason", () => {
    const projector = new PiTodoEventProjector();
    expect(
      projector.project(
        {
          type: "turn_end",
          message: { role: "assistant", stopReason: "toolUse" },
          toolResults: [],
        },
        4,
      ),
    ).toEqual([
      {
        eventKey: "step_finish:4",
        event: { kind: "step_finish", messageId: "pi:4", reason: "toolUse" },
      },
    ]);
  });

  it("omits the reason from step_finish when turn_end has no assistant message", () => {
    const projector = new PiTodoEventProjector();
    expect(
      projector.project({ type: "turn_end", message: null, toolResults: [] }, 5),
    ).toEqual([
      {
        eventKey: "step_finish:5",
        event: { kind: "step_finish", messageId: "pi:5", reason: undefined },
      },
    ]);
  });

  it("never reads assistant text or tool args/results, only names, ids, and status", () => {
    const projector = new PiTodoEventProjector();
    const events = projector.project(
      {
        type: "tool_execution_start",
        toolCallId: "call_1",
        toolName: "edit",
        args: { path: "src/secret.ts", content: "super secret patch" },
      },
      10,
    );
    expect(events).toEqual([
      {
        eventKey: "tool:call_1:running",
        event: { kind: "tool", tool: "edit", status: "running" },
      },
    ]);
    expect(JSON.stringify(events)).not.toContain("secret");
  });

  it("projects tool_execution_end as completed when isError is false", () => {
    const projector = new PiTodoEventProjector();
    expect(
      projector.project(
        {
          type: "tool_execution_end",
          toolCallId: "call_1",
          toolName: "edit",
          result: { content: "ok" },
          isError: false,
        },
        11,
      ),
    ).toEqual([
      {
        eventKey: "tool:call_1:completed",
        event: { kind: "tool", tool: "edit", status: "completed" },
      },
    ]);
  });

  it("projects tool_execution_end as error when isError is true, without leaking the result", () => {
    const projector = new PiTodoEventProjector();
    const events = projector.project(
      {
        type: "tool_execution_end",
        toolCallId: "call_2",
        toolName: "bash",
        result: { content: "rm -rf leaked output" },
        isError: true,
      },
      12,
    );
    expect(events).toEqual([
      {
        eventKey: "tool:call_2:error",
        event: { kind: "tool", tool: "bash", status: "error" },
      },
    ]);
    expect(JSON.stringify(events)).not.toContain("leaked");
  });

  it("projects compaction_start/compaction_end pairs with the auto flag carried over", () => {
    const projector = new PiTodoEventProjector();
    expect(
      projector.project({ type: "compaction_start", reason: "threshold" }, 20),
    ).toEqual([
      {
        eventKey: "compaction:20:started",
        event: { kind: "compaction", auto: true },
      },
    ]);
    expect(
      projector.project(
        { type: "compaction_end", reason: "threshold", result: {}, aborted: false, willRetry: false },
        21,
      ),
    ).toEqual([
      {
        eventKey: "compaction:21:ended",
        event: { kind: "compaction", auto: true },
      },
    ]);
  });

  it("marks a manual compaction as not auto", () => {
    const projector = new PiTodoEventProjector();
    projector.project({ type: "compaction_start", reason: "manual" }, 30);
    expect(
      projector.project(
        { type: "compaction_end", reason: "manual", result: {}, aborted: false, willRetry: false },
        31,
      ),
    ).toEqual([
      {
        eventKey: "compaction:31:ended",
        event: { kind: "compaction", auto: false },
      },
    ]);
  });

  it("projects agent_end with a failed/aborted final assistant message as an error milestone", () => {
    const projector = new PiTodoEventProjector();
    expect(
      projector.project(
        {
          type: "agent_end",
          willRetry: false,
          messages: [
            { role: "user", content: "do the thing" },
            {
              role: "assistant",
              stopReason: "error",
              errorMessage: "upstream provider returned 500",
            },
          ],
        },
        40,
      ),
    ).toEqual([
      {
        eventKey: "error:40",
        event: { kind: "error", message: "upstream provider returned 500" },
      },
    ]);
  });

  it("falls back to a generic message when agent_end has no errorMessage", () => {
    const projector = new PiTodoEventProjector();
    expect(
      projector.project(
        {
          type: "agent_end",
          willRetry: false,
          messages: [{ role: "assistant", stopReason: "aborted" }],
        },
        41,
      ),
    ).toEqual([
      {
        eventKey: "error:41",
        event: {
          kind: "error",
          message: 'Pi run ended with stop reason "aborted"',
        },
      },
    ]);
  });

  it("ignores agent_end when the final assistant message stopped normally", () => {
    const projector = new PiTodoEventProjector();
    expect(
      projector.project(
        {
          type: "agent_end",
          willRetry: false,
          messages: [{ role: "assistant", stopReason: "stop" }],
        },
        42,
      ),
    ).toEqual([]);
  });

  it("ignores unknown Pi event types, including the leading session header line", () => {
    const projector = new PiTodoEventProjector();
    expect(
      projector.project(
        { type: "session", version: 3, id: "abc", timestamp: "now", cwd: "/repo" },
        0,
      ),
    ).toEqual([]);
    expect(projector.project({ type: "agent_start" }, 1)).toEqual([]);
    expect(
      projector.project(
        { type: "message_start", message: { role: "assistant", content: "leaked" } },
        2,
      ),
    ).toEqual([]);
    expect(projector.project({ type: "queue_update", steering: [], followUp: [] }, 3)).toEqual([]);
  });

  it("ignores non-object and shapeless JSON values without throwing", () => {
    const projector = new PiTodoEventProjector();
    expect(projector.project("just a string", 0)).toEqual([]);
    expect(projector.project(42, 1)).toEqual([]);
    expect(projector.project(null, 2)).toEqual([]);
    expect(projector.project([1, 2, 3], 3)).toEqual([]);
  });
});
