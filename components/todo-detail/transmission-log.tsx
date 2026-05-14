import { memo, type RefObject } from "react";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  Archive,
  CheckCircle2,
  FileDiff,
  GitBranch,
  ListChecks,
  Minimize2,
  PlayCircle,
  Signal,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { formatAbsoluteTimestamp } from "./todo-detail-constants";

type TodoEventDoc = Doc<"todoEvents">;

function describeTodoEventLine(event: TodoEventDoc["event"]) {
  switch (event.kind) {
    case "session_status": {
      if (event.statusType === "busy") {
        return { title: "Session", detail: "Work started" };
      }
      if (event.statusType === "retry") {
        const parts = [
          event.message,
          event.attempt !== undefined ? `attempt ${event.attempt}` : null,
          event.next !== undefined ? `next ${event.next}ms` : null,
        ].filter(Boolean);
        return { title: "Session retry", detail: parts.join(" · ") };
      }
      return { title: "Session", detail: event.statusType };
    }
    case "session_compacted":
      return { title: "Session", detail: "Compacted" };
    case "step_start":
      return {
        title: "Step",
        detail: ["Started", event.agent, event.model].filter(Boolean).join(" · "),
      };
    case "step_finish":
      return {
        title: "Step",
        detail: event.reason ? `Finished — ${event.reason}` : "Finished",
      };
    case "tool": {
      const state =
        event.status === "running"
          ? "Running"
          : event.status === "completed"
            ? "Completed"
            : "Error";
      const name = [event.tool, event.title].filter(Boolean).join(" · ");
      return {
        title: `Tool ${state}`,
        detail: event.error ? `${name} — ${event.error}` : name,
      };
    }
    case "patch": {
      const preview = event.files.slice(0, 3).join(", ");
      const more = event.fileCount > 3 ? ` · +${event.fileCount - 3} more` : "";
      return {
        title: "Patch",
        detail: `${event.fileCount} file(s)${preview ? `: ${preview}` : ""}${more}`,
      };
    }
    case "compaction":
      return {
        title: "Compaction",
        detail: [event.auto ? "auto" : "manual", event.summary]
          .filter(Boolean)
          .join(" · "),
      };
    case "subtask":
      return {
        title: "Subtask",
        detail: `${event.agent} — ${event.description}`,
      };
    case "todo_updated":
      return {
        title: "Agent todo list",
        detail: `${event.todoCount} item(s) · ${event.summary}`,
      };
    case "error":
      return { title: "Error", detail: event.message };
    default: {
      const _exhaustive: never = event;
      return { title: "Event", detail: String(_exhaustive) };
    }
  }
}

function getTodoEventMeta(event: TodoEventDoc["event"]): {
  icon: LucideIcon;
  chipClass: string;
  iconClass: string;
  kindLabel: string;
} {
  switch (event.kind) {
    case "session_status": {
      if (event.statusType === "busy") {
        return {
          icon: Signal,
          chipClass: "border-col-inprogress/25 bg-col-inprogress/5",
          iconClass: "text-col-inprogress",
          kindLabel: "Session",
        };
      }
      if (event.statusType === "retry") {
        return {
          icon: Signal,
          chipClass: "border-col-todo/30 bg-col-todo/5",
          iconClass: "text-col-todo",
          kindLabel: "Session retry",
        };
      }
      return {
        icon: Signal,
        chipClass: "border-border/30 bg-muted/20",
        iconClass: "text-muted-foreground/80",
        kindLabel: "Session",
      };
    }
    case "session_compacted":
      return {
        icon: Archive,
        chipClass: "border-border/30 bg-muted/20",
        iconClass: "text-muted-foreground/85",
        kindLabel: "Session compacted",
      };
    case "step_start":
      return {
        icon: PlayCircle,
        chipClass: "border-col-inprogress/25 bg-col-inprogress/5",
        iconClass: "text-col-inprogress",
        kindLabel: "Step",
      };
    case "step_finish":
      return {
        icon: CheckCircle2,
        chipClass: "border-col-completed/25 bg-col-completed/5",
        iconClass: "text-col-completed",
        kindLabel: "Step",
      };
    case "tool": {
      if (event.status === "error") {
        return {
          icon: Wrench,
          chipClass: "border-col-failed/30 bg-col-failed/8",
          iconClass: "text-col-failed",
          kindLabel: "Tool",
        };
      }
      if (event.status === "running") {
        return {
          icon: Wrench,
          chipClass: "border-col-inprogress/25 bg-col-inprogress/5",
          iconClass: "text-col-inprogress",
          kindLabel: "Tool",
        };
      }
      return {
        icon: Wrench,
        chipClass: "border-col-completed/25 bg-col-completed/5",
        iconClass: "text-col-completed",
        kindLabel: "Tool",
      };
    }
    case "patch":
      return {
        icon: FileDiff,
        chipClass: "border-col-completed/20 bg-col-completed/5",
        iconClass: "text-col-completed",
        kindLabel: "Patch",
      };
    case "compaction":
      return {
        icon: Minimize2,
        chipClass: "border-border/30 bg-muted/20",
        iconClass: "text-muted-foreground/85",
        kindLabel: "Compaction",
      };
    case "subtask":
      return {
        icon: GitBranch,
        chipClass: "border-col-agent/25 bg-col-agent/6",
        iconClass: "text-col-agent",
        kindLabel: "Subtask",
      };
    case "todo_updated":
      return {
        icon: ListChecks,
        chipClass: "border-col-agent/25 bg-col-agent/6",
        iconClass: "text-col-agent",
        kindLabel: "Agent todo list",
      };
    case "error":
      return {
        icon: XCircle,
        chipClass: "border-col-failed/30 bg-col-failed/8",
        iconClass: "text-col-failed",
        kindLabel: "Error",
      };
  }
}

export const TransmissionLog = memo(function TransmissionLog({
  events,
  listRef,
  onScroll,
}: {
  events: TodoEventDoc[];
  listRef: RefObject<HTMLUListElement | null>;
  onScroll: () => void;
}) {
  return (
    <ul
      ref={listRef}
      onScroll={onScroll}
      className="mt-5 max-h-80 space-y-2 overflow-y-auto overscroll-contain pr-1 font-mono text-[11px]"
      aria-label="OpenCode event stream (recent)"
    >
      {events.map((row) => {
        const { title, detail } = describeTodoEventLine(row.event);
        const isErr = row.event.kind === "error";
        const isToolErr =
          row.event.kind === "tool" && row.event.status === "error";
        const {
          icon: EventIcon,
          chipClass,
          iconClass,
          kindLabel,
        } = getTodoEventMeta(row.event);
        return (
          <li
            key={row._id}
            className="transmission-log-row flex items-start gap-2.5 rounded-md border border-border/25 bg-background/20 px-2.5 py-2"
          >
            <div
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded border ${chipClass}`}
              title={kindLabel}
            >
              <EventIcon
                className={`h-3.5 w-3.5 stroke-[1.8] ${iconClass}`}
                aria-hidden
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span
                  className={
                    isErr || isToolErr
                      ? "text-col-failed"
                      : "text-foreground/90"
                  }
                >
                  {title}
                </span>
                <time
                  className="shrink-0 text-[9px] uppercase tracking-[0.2em] text-muted-foreground/50"
                  dateTime={new Date(row._creationTime).toISOString()}
                >
                  {formatAbsoluteTimestamp(row._creationTime)}
                </time>
              </div>
              <p
                className={`mt-0.5 break-words text-[10px] leading-relaxed ${
                  isErr
                    ? "text-col-failed/90"
                    : isToolErr
                      ? "text-col-failed/80"
                      : "text-muted-foreground/75"
                }`}
              >
                {detail}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
});
