import type { DragEvent } from "react";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { GripVertical } from "lucide-react";


export function TodoCard({
  todo,
  draggable,
  onDragStart,
  index,
}: {
  todo: Doc<"todos">;
  draggable: boolean;
  onDragStart: (event: DragEvent<HTMLDivElement>, todoId: Id<"todos">) => void;
  index: number;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={(event) => onDragStart(event, todo._id)}
      className={cn(
        "glass-card rounded-lg p-3 animate-in fade-in slide-in-from-bottom-2",
        draggable
          ? "cursor-grab active:cursor-grabbing active:scale-[0.98]"
          : "cursor-default",
      )}
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: "both" }}
    >
      <div className="flex items-start gap-2">
        {draggable && (
          <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-foreground">{todo.title}</h3>
          {todo.description ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {todo.description}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
