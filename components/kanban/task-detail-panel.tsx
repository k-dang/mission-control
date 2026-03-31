"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils";
import {
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";
import { ExternalLink, Clock, Loader2, Circle, RotateCw, CheckCircle2, XCircle } from "lucide-react";

const STATUS_OPTIONS: {
  value: Doc<"todos">["status"];
  label: string;
  colorClass: string;
  bgClass: string;
  icon: LucideIcon;
}[] = [
  {
    value: "TODO",
    label: "TODO",
    colorClass: "text-col-todo",
    bgClass: "bg-col-todo",
    icon: Circle,
  },
  {
    value: "INPROGRESS",
    label: "IN PROGRESS",
    colorClass: "text-col-inprogress",
    bgClass: "bg-col-inprogress",
    icon: RotateCw,
  },
  {
    value: "COMPLETED",
    label: "COMPLETED",
    colorClass: "text-col-completed",
    bgClass: "bg-col-completed",
    icon: CheckCircle2,
  },
  {
    value: "FAILED",
    label: "FAILED",
    colorClass: "text-col-failed",
    bgClass: "bg-col-failed",
    icon: XCircle,
  },
];

const STATUS_META: Record<
  Doc<"todos">["status"],
  { bg: string; border: string; shadow: string }
> = {
  TODO: {
    bg: "oklch(0.75 0.15 55 / 13%)",
    border: "oklch(0.75 0.15 55 / 45%)",
    shadow: "0 0 12px oklch(0.75 0.15 55 / 18%)",
  },
  INPROGRESS: {
    bg: "oklch(0.65 0.17 250 / 13%)",
    border: "oklch(0.65 0.17 250 / 45%)",
    shadow: "0 0 12px oklch(0.65 0.17 250 / 18%)",
  },
  COMPLETED: {
    bg: "oklch(0.68 0.14 155 / 13%)",
    border: "oklch(0.68 0.14 155 / 45%)",
    shadow: "0 0 12px oklch(0.68 0.14 155 / 18%)",
  },
  FAILED: {
    bg: "oklch(0.62 0.2 25 / 13%)",
    border: "oklch(0.62 0.2 25 / 45%)",
    shadow: "0 0 12px oklch(0.62 0.2 25 / 18%)",
  },
};

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
  const createPullRequest = useAction(api.github.createPullRequestForTodo);

  const [editTitle, setEditTitle] = useState(todo.title);
  const [editDescription, setEditDescription] = useState(
    todo.description ?? "",
  );
  const [editGithubUrl, setEditGithubUrl] = useState(todo.githubUrl ?? "");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [prError, setPrError] = useState<string | null>(null);
  const [isCreatingPr, setIsCreatingPr] = useState(false);

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

  const canCreatePr = Boolean(todo.githubUrl && todo.sandboxId && !todo.prUrl);

  const handleCreatePr = async () => {
    if (!canCreatePr || isCreatingPr) {
      return;
    }

    setPrError(null);
    setIsCreatingPr(true);

    try {
      await createPullRequest({ todoId: todo._id });
    } catch (error: unknown) {
      setPrError(getErrorMessage(error));
    } finally {
      setIsCreatingPr(false);
    }
  };

  const handleKeyDownRevert = (e: KeyboardEvent, revert: () => void) => {
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
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((opt) => {
              const isActive = opt.value === todo.status;
              const meta = STATUS_META[opt.value];
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  onClick={() => handleStatusChange(opt.value)}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-all duration-200",
                    isActive
                      ? opt.colorClass
                      : "text-muted-foreground/40 hover:text-muted-foreground/70",
                  )}
                  style={
                    isActive
                      ? {
                          background: meta.bg,
                          border: `1px solid ${meta.border}`,
                          boxShadow: meta.shadow,
                        }
                      : {
                          background: "transparent",
                          border: "1px solid oklch(1 0 0 / 8%)",
                        }
                  }
                >
                  <Icon className="h-2.5 w-2.5" />
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
            {canCreatePr && (
              <div className="flex items-center gap-3 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCreatePr}
                  disabled={isCreatingPr}
                >
                  {isCreatingPr ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {isCreatingPr ? "Creating PR..." : "Create PR"}
                </Button>
                {prError ? (
                  <p className="text-xs text-destructive">{prError}</p>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Delete */}
        <div className="pt-2">
          {showDeleteConfirm ? (
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] text-muted-foreground/60 uppercase tracking-widest">
                Delete this task?
              </span>
              <Button
                variant="link"
                size="sm"
                onClick={handleDelete}
                className="h-auto p-0 font-mono text-[10px] uppercase tracking-widest text-destructive"
              >
                Confirm
              </Button>
              <Button
                variant="link"
                size="sm"
                onClick={() => setShowDeleteConfirm(false)}
                className="h-auto p-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50 hover:text-muted-foreground"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete task
            </Button>
          )}
        </div>
      </div>

    </div>
  );
}
