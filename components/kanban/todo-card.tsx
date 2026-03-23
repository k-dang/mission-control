import { useRef, type DragEvent } from "react";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils";
import { GripVertical, Clock } from "lucide-react";

const STATUS_DOT_COLOR: Record<Doc<"todos">["status"], string> = {
  TODO: "bg-col-todo",
  INPROGRESS: "bg-col-inprogress",
  COMPLETED: "bg-col-completed",
};

export function TodoCard({
  todo,
  draggable,
  onDragStart,
  index,
  onClick,
}: {
  todo: Doc<"todos">;
  draggable: boolean;
  onDragStart: (event: DragEvent<HTMLDivElement>, todoId: Id<"todos">) => void;
  index: number;
  onClick?: (todo: Doc<"todos">) => void;
}) {
  const isCompleted = todo.status === "COMPLETED";
  const isDragging = useRef(false);

  return (
    <div
      draggable={draggable}
      onDragStart={(event) => {
        isDragging.current = true;
        onDragStart(event, todo._id);
      }}
      onDragEnd={() => {
        isDragging.current = false;
      }}
      onClick={() => {
        if (!isDragging.current && onClick) {
          onClick(todo);
        }
      }}
      className={cn(
        "group glass-card todo-card rounded-lg p-3 animate-in fade-in slide-in-from-bottom-2",
        draggable
          ? "cursor-grab active:cursor-grabbing"
          : onClick
            ? "cursor-pointer"
            : "cursor-default",
        isCompleted && "opacity-60",
      )}
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: "both" }}
    >
      <div className="flex items-start gap-2">
        {draggable && (
          <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-block h-2 w-2 shrink-0 rounded-full",
                STATUS_DOT_COLOR[todo.status],
              )}
            />
            <h3
              className={cn(
                "text-sm font-medium text-foreground",
                isCompleted && "line-through text-muted-foreground",
              )}
            >
              {todo.title}
            </h3>
          </div>
          {todo.description ? (
            <p className="mt-1 ml-4 text-sm text-muted-foreground">
              {todo.description}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 border-t border-border/30 pt-2">
        <Clock className="h-3 w-3 text-muted-foreground/50" />
        <span className="font-mono text-[10px] text-muted-foreground/50">
          {formatRelativeTime(todo._creationTime)}
        </span>
      </div>
      {todo.sandboxUrl && (
        <a
          href={todo.sandboxUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-[--col-inprogress] underline hover:opacity-80"
        >
          Open Sandbox →
        </a>
      )}
      {todo.prUrl && (
        <a
          href={todo.prUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-[--col-inprogress] underline hover:opacity-80"
        >
          Open PR →
        </a>
      )}
    </div>
  );
}
