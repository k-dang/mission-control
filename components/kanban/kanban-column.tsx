import type { DragEvent } from "react";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import {
  CircleDot,
  Timer,
  CheckCircle2,
  Inbox,
  ArrowRight,
  PartyPopper,
  CircleAlert,
} from "lucide-react";
import { TodoCard } from "./todo-card";
import { ScrollArea } from "@/components/ui/scroll-area";

const COLUMN_CONFIG: Record<
  Doc<"todos">["status"],
  {
    label: string;
    icon: typeof CircleDot;
    colorClass: string;
    emptyText: string;
    emptySubtext: string;
    emptyIcon: typeof Inbox;
    accentClass: string;
  }
> = {
  TODO: {
    label: "TODO",
    icon: CircleDot,
    colorClass: "text-col-todo",
    emptyText: "No tasks yet",
    emptySubtext: "Add one with the quick bar above",
    emptyIcon: Inbox,
    accentClass: "column-accent-TODO",
  },
  INPROGRESS: {
    label: "IN PROGRESS",
    icon: Timer,
    colorClass: "text-col-inprogress",
    emptyText: "Nothing in progress",
    emptySubtext: "Drag a TODO card here to start",
    emptyIcon: ArrowRight,
    accentClass: "column-accent-INPROGRESS",
  },
  COMPLETED: {
    label: "COMPLETED",
    icon: CheckCircle2,
    colorClass: "text-col-completed",
    emptyText: "Nothing completed",
    emptySubtext: "Finished tasks appear here",
    emptyIcon: PartyPopper,
    accentClass: "column-accent-COMPLETED",
  },
  FAILED: {
    label: "FAILED",
    icon: CircleAlert,
    colorClass: "text-col-failed",
    emptyText: "No failed tasks",
    emptySubtext: "Errors from automation show here",
    emptyIcon: CircleAlert,
    accentClass: "column-accent-FAILED",
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
  onCardClick,
}: {
  status: Doc<"todos">["status"];
  todos: Doc<"todos">[];
  draggable: boolean;
  onDragStart: (event: DragEvent<HTMLDivElement>, todoId: Id<"todos">) => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave?: () => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
  isDropTarget?: boolean;
  onCardClick?: (todo: Doc<"todos">) => void;
}) {
  const config = COLUMN_CONFIG[status];
  const Icon = config.icon;
  const EmptyIcon = config.emptyIcon;

  return (
    <section
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "rounded-xl border border-border/50 bg-card/40 p-4 transition-all duration-200 md:flex md:min-h-0 md:flex-col md:overflow-hidden",
        config.accentClass,
        isDropTarget && (status === "INPROGRESS" ? "drop-glow-inprogress border-col-inprogress/30" : "drop-glow border-primary/30"),
      )}
    >
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-lg",
                "bg-surface-glass backdrop-blur-sm",
              )}
            >
              <Icon className={cn("h-3.5 w-3.5", config.colorClass)} />
            </div>
            <h2
              className={cn(
                "font-mono text-xs font-bold uppercase tracking-[0.15em]",
                config.colorClass,
              )}
            >
              {config.label}
            </h2>
          </div>
          <span className="rounded-full bg-muted/60 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
            {todos.length}
          </span>
        </div>
      </div>
      <ScrollArea className="max-h-[calc(100vh-320px)] md:flex-1 md:min-h-0 md:max-h-none">
        <div className="space-y-3 pr-3">
          {todos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/40 p-6 text-center">
              <EmptyIcon className="h-5 w-5 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground/60">
                {config.emptyText}
              </p>
              <p className="text-xs text-muted-foreground/35">
                {config.emptySubtext}
              </p>
            </div>
          ) : (
            todos.map((todo, i) => (
              <TodoCard
                key={todo._id}
                todo={todo}
                draggable={draggable}
                onDragStart={onDragStart}
                index={i}
                onClick={onCardClick}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </section>
  );
}
