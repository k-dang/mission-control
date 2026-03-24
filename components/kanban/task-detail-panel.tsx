"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils";
import {
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Trash2, ExternalLink, Clock } from "lucide-react";

const STATUS_OPTIONS: {
  value: Doc<"todos">["status"];
  label: string;
  colorClass: string;
  bgClass: string;
}[] = [
  {
    value: "TODO",
    label: "TODO",
    colorClass: "text-col-todo",
    bgClass: "bg-col-todo",
  },
  {
    value: "INPROGRESS",
    label: "IN PROGRESS",
    colorClass: "text-col-inprogress",
    bgClass: "bg-col-inprogress",
  },
  {
    value: "COMPLETED",
    label: "COMPLETED",
    colorClass: "text-col-completed",
    bgClass: "bg-col-completed",
  },
  {
    value: "FAILED",
    label: "FAILED",
    colorClass: "text-col-failed",
    bgClass: "bg-col-failed",
  },
];

const STATUS_DOT_COLOR: Record<Doc<"todos">["status"], string> = {
  TODO: "bg-col-todo",
  INPROGRESS: "bg-col-inprogress",
  COMPLETED: "bg-col-completed",
  FAILED: "bg-col-failed",
};

export function TaskDetailPanel({
  todo,
  onClose,
}: {
  todo: Doc<"todos">;
  onClose: () => void;
}) {
  const updateTodo = useMutation(api.todos.update);
  const deleteTodo = useMutation(api.todos.remove);

  const [editTitle, setEditTitle] = useState(todo.title);
  const [editDescription, setEditDescription] = useState(
    todo.description ?? "",
  );
  const [editGithubUrl, setEditGithubUrl] = useState(todo.githubUrl ?? "");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = descriptionRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [editDescription]);

  const commitTitle = () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== todo.title) {
      updateTodo({ todoId: todo._id, title: trimmed });
    } else {
      setEditTitle(todo.title);
    }
  };

  const commitDescription = () => {
    const trimmed = editDescription.trim();
    if (trimmed !== (todo.description ?? "")) {
      updateTodo({
        todoId: todo._id,
        description: trimmed || "",
      });
    }
  };

  const commitGithubUrl = () => {
    const trimmed = editGithubUrl.trim();
    if (trimmed !== (todo.githubUrl ?? "")) {
      updateTodo({ todoId: todo._id, githubUrl: trimmed || "" });
    }
  };

  const handleStatusChange = (status: Doc<"todos">["status"]) => {
    if (status !== todo.status) {
      updateTodo({ todoId: todo._id, status });
      if (status === "COMPLETED" && todo.status === "INPROGRESS") {
        onClose();
      }
    }
  };

  const handleDelete = async () => {
    await deleteTodo({ todoId: todo._id });
    onClose();
  };

  const handleKeyDownRevert = (
    e: KeyboardEvent,
    revert: () => void,
  ) => {
    if (e.key === "Escape") {
      revert();
      (e.target as HTMLElement).blur();
    }
  };

  const currentStatusOption = STATUS_OPTIONS.find(
    (s) => s.value === todo.status,
  )!;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <SheetHeader className="border-b border-border/30 pb-4">
        <div className="flex items-center justify-between pr-8">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-block h-2.5 w-2.5 rounded-full",
                STATUS_DOT_COLOR[todo.status],
              )}
            />
            <span
              className={cn(
                "font-mono text-[10px] font-bold uppercase tracking-[0.15em]",
                currentStatusOption.colorClass,
              )}
            >
              {currentStatusOption.label}
            </span>
          </div>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="rounded-md p-1.5 text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
            title="Delete task"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <SheetTitle className="sr-only">{todo.title}</SheetTitle>
        <SheetDescription className="sr-only">
          Task detail panel for editing
        </SheetDescription>
        <input
          ref={titleRef}
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              (e.target as HTMLElement).blur();
            }
            handleKeyDownRevert(e, () => setEditTitle(todo.title));
          }}
          className="mt-1 w-full border-b border-transparent bg-transparent text-lg font-semibold text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-b-primary/40"
        />
      </SheetHeader>

      <div className="flex-1 space-y-6 p-4">
        {/* Metadata */}
        <div className="flex items-center gap-3 text-muted-foreground/60">
          <Clock className="h-3 w-3" />
          <span className="font-mono text-[10px] uppercase tracking-widest">
            Created {formatRelativeTime(todo._creationTime)}
          </span>
        </div>

        {/* Status pills */}
        <div>
          <label className="mb-2 block font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
            Status
          </label>
          <div className="flex gap-2">
            {STATUS_OPTIONS.map((opt) => {
              const isActive = opt.value === todo.status;
              return (
                <button
                  key={opt.value}
                  onClick={() => handleStatusChange(opt.value)}
                  className={cn(
                    "rounded-full px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-all",
                    isActive
                      ? `${opt.bgClass} text-background`
                      : "border border-border/50 text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="mb-2 block font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
            Description
          </label>
          <textarea
            ref={descriptionRef}
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            onBlur={commitDescription}
            onKeyDown={(e) =>
              handleKeyDownRevert(e, () =>
                setEditDescription(todo.description ?? ""),
              )
            }
            placeholder="Add a description..."
            rows={1}
            className="w-full resize-none border-b border-transparent bg-transparent text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-b-primary/40"
          />
        </div>

        {/* Links */}
        <div className="space-y-3">
          <label className="block font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
            Links
          </label>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-muted-foreground/60">
                GITHUB
              </span>
              <input
                value={editGithubUrl}
                onChange={(e) => setEditGithubUrl(e.target.value)}
                onBlur={commitGithubUrl}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    (e.target as HTMLElement).blur();
                  }
                  handleKeyDownRevert(e, () =>
                    setEditGithubUrl(todo.githubUrl ?? ""),
                  );
                }}
                placeholder="https://github.com/owner/repo"
                className="min-w-0 flex-1 truncate border-b border-transparent bg-transparent text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-b-primary/40"
              />
              {editGithubUrl.trim() && (
                <a
                  href={editGithubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-muted-foreground/50 transition-colors hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>

            {todo.sandboxUrl && (
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground/60">
                  SANDBOX
                </span>
                <a
                  href={todo.sandboxUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 truncate text-sm text-[--col-inprogress] hover:opacity-80"
                >
                  {todo.sandboxUrl}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
            )}

            {todo.prUrl && (
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground/60">
                  PR
                </span>
                <a
                  href={todo.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 truncate text-sm text-[--col-inprogress] hover:opacity-80"
                >
                  {todo.prUrl}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <SheetFooter className="border-t border-border/30">
          <p className="text-sm text-muted-foreground">Delete this task?</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </SheetFooter>
      )}
    </div>
  );
}
