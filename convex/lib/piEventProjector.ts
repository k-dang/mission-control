import type { TodoEventInput } from "./todoEventValidator";

/**
 * Stateful translator from parsed Pi JSON-mode stdout lines to our persisted
 * todo milestones. Mirrors {@link OpencodeTodoEventProjector} but for Pi's
 * `AgentSessionEvent` dialect (upstream shapes in
 * opensrc/.../earendil-works/pi packages/coding-agent/src/core/agent-session.ts
 * and packages/agent/src/types.ts, pinned at PI_VERSION). Unrecognized `type`
 * values (including Pi's leading session-header line) are ignored; assistant
 * text, tool arguments, and tool results are never read.
 *
 * `lineSeq` restarts from 0 each time a monitor slice reconnects, so event
 * keys derived from it (or from Pi's stable per-call id) are identical on
 * replay and `todoEvents.append` dedupes them.
 */
export class PiTodoEventProjector {
  private activeCompactionAuto: boolean | undefined;
  private terminalFailureReason: string | undefined;

  getTerminalFailureReason() {
    return this.terminalFailureReason;
  }

  project(rawLine: unknown, lineSeq: number): TodoEventInput[] {
    if (!isPiEventShape(rawLine)) {
      return [];
    }

    switch (rawLine.type) {
      case "turn_start":
        return [
          {
            eventKey: `step_start:${lineSeq}`,
            event: { kind: "step_start", messageId: `pi:${lineSeq}` },
          },
        ];

      case "turn_end": {
        const message = rawLine.message;
        const reason = isAssistantMessageShape(message)
          ? message.stopReason
          : undefined;
        return [
          {
            eventKey: `step_finish:${lineSeq}`,
            event: { kind: "step_finish", messageId: `pi:${lineSeq}`, reason },
          },
        ];
      }

      case "tool_execution_start": {
        const toolCallId = readString(rawLine.toolCallId);
        const toolName = readString(rawLine.toolName);
        if (!toolCallId || !toolName) return [];
        return [
          {
            eventKey: `tool:${toolCallId}:running`,
            event: { kind: "tool", tool: toolName, status: "running" },
          },
        ];
      }

      case "tool_execution_end": {
        const toolCallId = readString(rawLine.toolCallId);
        const toolName = readString(rawLine.toolName);
        if (!toolCallId || !toolName) return [];
        const isError = rawLine.isError === true;
        return [
          {
            eventKey: `tool:${toolCallId}:${isError ? "error" : "completed"}`,
            event: {
              kind: "tool",
              tool: toolName,
              status: isError ? "error" : "completed",
            },
          },
        ];
      }

      case "compaction_start": {
        this.activeCompactionAuto = rawLine.reason !== "manual";
        return [
          {
            eventKey: `compaction:${lineSeq}:started`,
            event: { kind: "compaction", auto: this.activeCompactionAuto },
          },
        ];
      }

      case "compaction_end": {
        const auto = this.activeCompactionAuto ?? false;
        this.activeCompactionAuto = undefined;
        return [
          {
            eventKey: `compaction:${lineSeq}:ended`,
            event: { kind: "compaction", auto },
          },
        ];
      }

      case "agent_end": {
        const messages = Array.isArray(rawLine.messages) ? rawLine.messages : [];
        let lastAssistant: AssistantMessageShape | undefined;
        for (let i = messages.length - 1; i >= 0; i--) {
          const candidate = messages[i];
          if (isAssistantMessageShape(candidate)) {
            lastAssistant = candidate;
            break;
          }
        }
        if (
          lastAssistant &&
          (lastAssistant.stopReason === "error" ||
            lastAssistant.stopReason === "aborted")
        ) {
          const message =
            lastAssistant.errorMessage?.trim() ||
            `Pi run ended with stop reason "${lastAssistant.stopReason}"`;
          if (rawLine.willRetry !== true) {
            this.terminalFailureReason = message;
          }
          return [{ eventKey: `error:${lineSeq}`, event: { kind: "error", message } }];
        }
        return [];
      }

      default:
        return [];
    }
  }
}

type PiEventShape = { type: string; [key: string]: unknown };

function isPiEventShape(value: unknown): value is PiEventShape {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

type AssistantMessageShape = {
  role: "assistant";
  stopReason?: string;
  errorMessage?: string;
};

function isAssistantMessageShape(value: unknown): value is AssistantMessageShape {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { role?: unknown }).role === "assistant"
  );
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
