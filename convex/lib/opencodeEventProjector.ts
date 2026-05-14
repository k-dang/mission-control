import type { Event } from "@opencode-ai/sdk/v2";

import type { TodoEventInput } from "./todoEventValidator";

type ProjectorState = {
  activeCompactionAuto?: boolean;
  lastSessionStatus?: string;
  lastTodoSummary?: string;
  toolNameByCallId: Map<string, string>;
};

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

function optionalStateTitle(state: object) {
  return "title" in state && typeof state.title === "string"
    ? state.title
    : undefined;
}

/**
 * Stateful translator from raw OpenCode SSE events to our persisted todo
 * milestones. It hides OpenCode event dialect details and keeps the small
 * amount of correlation/dedupe state needed across events.
 */
export class OpencodeTodoEventProjector {
  private readonly state: ProjectorState = {
    toolNameByCallId: new Map(),
  };

  constructor(private readonly sessionId: string) {}

  project(event: Event): TodoEventInput[] {
    if (
      event.type === "session.error" &&
      event.properties.sessionID === this.sessionId
    ) {
      const error = event.properties.error;
      const message = !error
        ? "OpenCode session ended with an unknown error"
        : error.name === "MessageOutputLengthError"
          ? "OpenCode message exceeded output length"
          : error.data.message;
      return [{ eventKey: `error:${message}`, event: { kind: "error", message } }];
    }

    if (
      event.type === "session.status" &&
      event.properties.sessionID === this.sessionId
    ) {
      return this.projectSessionStatus(event.properties.status);
    }

    if (
      event.type === "todo.updated" &&
      event.properties.sessionID === this.sessionId
    ) {
      const summary = summarizeTodos(event.properties.todos);
      if (this.state.lastTodoSummary === summary) {
        return [];
      }
      this.state.lastTodoSummary = summary;

      return [
        {
          eventKey: `todo_updated:${summary}`,
          event: {
            kind: "todo_updated",
            todoCount: event.properties.todos.length,
            summary,
          },
        },
      ];
    }

    if (
      event.type === "session.compacted" &&
      event.properties.sessionID === this.sessionId
    ) {
      return [
        {
          eventKey: `session_compacted:${event.id}`,
          event: { kind: "session_compacted" },
        },
      ];
    }

    if (
      event.type === "message.part.updated" &&
      event.properties.sessionID === this.sessionId
    ) {
      return this.projectMessagePart(event);
    }

    if (
      event.type === "session.next.retried" &&
      event.properties.sessionID === this.sessionId
    ) {
      const { attempt, error } = event.properties;
      return [
        {
          eventKey: `session_next_retried:${event.id}`,
          event: {
            kind: "session_status",
            statusType: "retry",
            message: error.message,
            attempt,
            next: undefined,
          },
        },
      ];
    }

    if (
      event.type === "session.next.step.started" &&
      event.properties.sessionID === this.sessionId
    ) {
      return [
        {
          eventKey: `step_start:${event.id}`,
          event: {
            kind: "step_start",
            messageId: event.id,
            agent: event.properties.agent,
            model: `${event.properties.model.providerID}/${event.properties.model.id}`,
          },
        },
      ];
    }

    if (
      event.type === "session.next.step.ended" &&
      event.properties.sessionID === this.sessionId
    ) {
      return [
        {
          eventKey: `step_finish:${event.id}`,
          event: {
            kind: "step_finish",
            messageId: event.id,
            reason: event.properties.finish,
          },
        },
      ];
    }

    if (
      event.type === "session.next.step.failed" &&
      event.properties.sessionID === this.sessionId
    ) {
      return [
        {
          eventKey: `step_failed:${event.id}`,
          event: {
            kind: "error",
            message: event.properties.error.message,
          },
        },
      ];
    }

    if (
      event.type === "session.next.tool.input.started" &&
      event.properties.sessionID === this.sessionId
    ) {
      this.state.toolNameByCallId.set(
        event.properties.callID,
        event.properties.name,
      );
      return [];
    }

    if (
      event.type === "session.next.tool.called" &&
      event.properties.sessionID === this.sessionId
    ) {
      this.state.toolNameByCallId.set(
        event.properties.callID,
        event.properties.tool,
      );
      return [
        {
          eventKey: `tool:${event.properties.callID}:running`,
          event: {
            kind: "tool",
            tool: event.properties.tool,
            status: "running",
          },
        },
      ];
    }

    if (
      event.type === "session.next.tool.success" &&
      event.properties.sessionID === this.sessionId
    ) {
      return [
        {
          eventKey: `tool:${event.properties.callID}:completed`,
          event: {
            kind: "tool",
            tool:
              this.state.toolNameByCallId.get(event.properties.callID) ??
              event.properties.callID,
            status: "completed",
          },
        },
      ];
    }

    if (
      event.type === "session.next.tool.failed" &&
      event.properties.sessionID === this.sessionId
    ) {
      return [
        {
          eventKey: `tool:${event.properties.callID}:error`,
          event: {
            kind: "tool",
            tool:
              this.state.toolNameByCallId.get(event.properties.callID) ??
              event.properties.callID,
            status: "error",
            error: event.properties.error.message,
          },
        },
      ];
    }

    if (
      event.type === "session.next.shell.started" &&
      event.properties.sessionID === this.sessionId
    ) {
      return [
        {
          eventKey: `shell:${event.properties.callID}:running`,
          event: {
            kind: "tool",
            tool: "shell",
            status: "running",
            title: event.properties.command,
          },
        },
      ];
    }

    if (
      event.type === "session.next.shell.ended" &&
      event.properties.sessionID === this.sessionId
    ) {
      return [
        {
          eventKey: `shell:${event.properties.callID}:completed`,
          event: {
            kind: "tool",
            tool: "shell",
            status: "completed",
          },
        },
      ];
    }

    if (
      event.type === "session.next.compaction.started" &&
      event.properties.sessionID === this.sessionId
    ) {
      this.state.activeCompactionAuto = event.properties.reason === "auto";
      return [
        {
          eventKey: `compaction:${event.id}:started`,
          event: {
            kind: "compaction",
            auto: event.properties.reason === "auto",
          },
        },
      ];
    }

    if (
      event.type === "session.next.compaction.ended" &&
      event.properties.sessionID === this.sessionId
    ) {
      const output: TodoEventInput = {
        eventKey: `compaction:${event.id}:ended`,
        event: {
          kind: "compaction",
          auto: this.state.activeCompactionAuto ?? false,
          summary: event.properties.text.slice(0, 240),
        },
      };
      this.state.activeCompactionAuto = undefined;
      return [output];
    }

    return [];
  }

  private projectSessionStatus(
    status: Extract<Event, { type: "session.status" }>["properties"]["status"],
  ): TodoEventInput[] {
    if (status.type === "idle") {
      return [];
    }

    const summary =
      status.type === "retry"
        ? `retry:${status.attempt}:${status.message}:${status.next}`
        : status.type;
    if (this.state.lastSessionStatus === summary) {
      return [];
    }
    this.state.lastSessionStatus = summary;

    if (status.type === "busy") {
      return [
        {
          eventKey: `session_status:${summary}`,
          event: { kind: "session_status", statusType: "busy" },
        },
      ];
    }

    if (status.type === "retry") {
      return [
        {
          eventKey: `session_status:${summary}`,
          event: {
            kind: "session_status",
            statusType: "retry",
            message: status.message,
            attempt: status.attempt,
            next: status.next,
          },
        },
      ];
    }

    return [];
  }

  private projectMessagePart(
    event: Extract<Event, { type: "message.part.updated" }>,
  ): TodoEventInput[] {
    const part = event.properties.part;

    if (part.type === "step-start") {
      return [
        {
          eventKey: `step_start:${part.id}`,
          event: {
            kind: "step_start",
            messageId: part.messageID,
          },
        },
      ];
    }

    if (part.type === "step-finish") {
      return [
        {
          eventKey: `step_finish:${part.id}`,
          event: {
            kind: "step_finish",
            messageId: part.messageID,
            reason: part.reason,
          },
        },
      ];
    }

    if (part.type !== "tool") {
      return [];
    }

    const callId = part.callID;
    const tool = part.tool;
    this.state.toolNameByCallId.set(callId, tool);

    if (part.state.status === "pending" || part.state.status === "running") {
      return [
        {
          eventKey: `tool:${callId}:running`,
          event: {
            kind: "tool",
            tool,
            status: "running",
            title: optionalStateTitle(part.state),
          },
        },
      ];
    }

    if (part.state.status === "completed") {
      return [
        {
          eventKey: `tool:${callId}:completed`,
          event: {
            kind: "tool",
            tool,
            status: "completed",
            title: optionalStateTitle(part.state),
          },
        },
      ];
    }

    if (part.state.status === "error") {
      return [
        {
          eventKey: `tool:${callId}:error`,
          event: {
            kind: "tool",
            tool,
            status: "error",
            error: part.state.error,
          },
        },
      ];
    }

    return [];
  }
}
