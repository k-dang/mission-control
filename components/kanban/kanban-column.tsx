import type { DragEvent } from "react";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { CircleDot, Timer, CheckCircle2 } from "lucide-react";
import { TodoCard } from "./todo-card";
const COLUMN_CONFIG: Record<
  Doc<"todos">["status"],
  {
    label: string;
    icon: typeof CircleDot;
    colorClass: string;
    emptyText: string;
  }
> = {
  TODO: {
    label: "TODO",
    icon: CircleDot,
    colorClass: "text-col-todo",
    emptyText: "No tasks yet — add one above",
  },
  INPROGRESS: {
    label: "IN PROGRESS",
    icon: Timer,
    colorClass: "text-col-inprogress",
    emptyText: "Drop TODO cards here",
  },
  COMPLETED: {
    label: "COMPLETED",
    icon: CheckCircle2,
    colorClass: "text-col-completed",
    emptyText: "Nothing completed yet",
  },
};

export function KanbanColumn({
  status,
  todos,
  draggable,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  isDropTarget,
}: {
  status: Doc<"todos">["status"];
  todos: Doc<"todos">[];
  draggable: boolean;
  onDragStart: (event: DragEvent<HTMLDivElement>, todoId: Id<"todos">) => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave?: () => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
  isDropTarget?: boolean;
}) {
  const config = COLUMN_CONFIG[status];
  const Icon = config.icon;

  return (
    <section
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "rounded-xl border border-border/50 bg-card/40 p-4 transition-all duration-200",
        isDropTarget && "drop-glow border-primary/30",
      )}
    >
      <div className="mb-4 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={cn("h-4 w-4", config.colorClass)} />
            <h2
              className={cn(
                "text-sm font-bold uppercase tracking-widest",
                config.colorClass,
              )}
            >
              {config.label}
            </h2>
          </div>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {todos.length}
          </span>
        </div>
      </div>
      <div className="space-y-3">
        {todos.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/50 p-3 text-center text-sm text-muted-foreground">
            {config.emptyText}
          </p>
        ) : (
          todos.map((todo, i) => (
            <TodoCard
              key={todo._id}
              todo={todo}
              draggable={draggable}
              onDragStart={onDragStart}
              index={i}
            />
          ))
        )}
      </div>
    </section>
  );
}
