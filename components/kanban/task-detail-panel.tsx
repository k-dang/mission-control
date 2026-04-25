"use client";

import Link from "next/link";
import { useState, useRef, useId, type KeyboardEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils";
import {
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { LucideIcon } from "lucide-react";
import { ExternalLink, Clock, Circle, RotateCw, CheckCircle2, XCircle } from "lucide-react";

type StatusOption = {
  value: Doc<"todos">["status"];
  label: string;
  colorClass: string;
  bgClass: string;
  icon: LucideIcon;
};

const STATUS_OPTIONS_BY_STATUS: Record<Doc<"todos">["status"], StatusOption> = {
  TODO: {
    value: "TODO",
    label: "TODO",
    colorClass: "text-col-todo",
    bgClass: "bg-col-todo",
    icon: Circle,
  },
  INPROGRESS: {
    value: "INPROGRESS",
    label: "IN PROGRESS",
    colorClass: "text-col-inprogress",
    bgClass: "bg-col-inprogress",
    icon: RotateCw,
  },
  COMPLETED: {
    value: "COMPLETED",
    label: "COMPLETED",
    colorClass: "text-col-completed",
    bgClass: "bg-col-completed",
    icon: CheckCircle2,
  },
  FAILED: {
    value: "FAILED",
    label: "FAILED",
    colorClass: "text-col-failed",
    bgClass: "bg-col-failed",
    icon: XCircle,
  },
};

const STATUS_OPTIONS = Object.values(STATUS_OPTIONS_BY_STATUS);

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
  const sandbox = useQuery(api.todoSandboxes.getSandboxForTodo, {
    todoId: todo._id,
  });

  const [editTitle, setEditTitle] = useState(todo.title);
  const [editDescription, setEditDescription] = useState(
    todo.description ?? "",
  );
  const [editGithubUrl, setEditGithubUrl] = useState(todo.githubUrl ?? "");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  const statusSectionLabelId = useId();
  const descriptionFieldId = useId();
  const githubUrlFieldId = useId();

  const isEditable = todo.status === "TODO";

  const commitTitle = () => {
    if (!isEditable) return;
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== todo.title) {
      updateTodo({ todoId: todo._id, title: trimmed });
    } else {
      setEditTitle(todo.title);
    }
  };

  const commitDescription = () => {
    if (!isEditable) return;
    const trimmed = editDescription.trim();
    if (trimmed !== (todo.description ?? "")) {
      updateTodo({
        todoId: todo._id,
        description: trimmed || "",
      });
    }
  };

  const commitGithubUrl = () => {
    if (!isEditable) return;
    const trimmed = editGithubUrl.trim();
    if (trimmed !== (todo.githubUrl ?? "")) {
      updateTodo({ todoId: todo._id, githubUrl: trimmed || "" });
    }
  };

  const handleStatusChange = (status: Doc<"todos">["status"]) => {
    if (todo.status !== "TODO") return;
    if (status === todo.status) return;
    if (status !== "INPROGRESS") return;
    updateTodo({ todoId: todo._id, status });
  };

  const handleDelete = async () => {
    await deleteTodo({ todoId: todo._id });
    onClose();
  };

  const handleKeyDownRevert = (
    e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    revert: () => void,
  ) => {
    if (e.key === "Escape") {
      revert();
      e.currentTarget.blur();
    }
  };

  const currentStatusOption = STATUS_OPTIONS_BY_STATUS[todo.status];

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <SheetHeader className="border-b border-border/30 pb-4 pt-8">
        <div className="flex items-center gap-2 pr-8">
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
        <SheetTitle className="sr-only">{todo.title}</SheetTitle>
        <SheetDescription className="sr-only">
          Task detail panel for editing
        </SheetDescription>
        <Input
          ref={titleRef}
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
            handleKeyDownRevert(e, () => setEditTitle(todo.title));
          }}
          readOnly={!isEditable}
          aria-readonly={!isEditable}
          className={cn(
            "mt-1 h-auto rounded-lg border border-border/20 bg-muted/30 px-3 py-2 text-lg font-semibold shadow-none outline-none transition-colors placeholder:text-muted-foreground/40 focus-visible:border-primary/40 focus-visible:ring-0",
            !isEditable && "cursor-not-allowed opacity-70",
          )}
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
        <div role="group" aria-labelledby={statusSectionLabelId}>
          <Label
            id={statusSectionLabelId}
            className="mb-2 block font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground"
          >
            Status
          </Label>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((opt) => {
              const isActive = opt.value === todo.status;
              const meta = STATUS_META[opt.value];
              const Icon = opt.icon;
              const statusLocked = todo.status !== "TODO";
              const pillDisabled =
                statusLocked ||
                (todo.status === "TODO" &&
                  (opt.value === "COMPLETED" || opt.value === "FAILED"));
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={pillDisabled}
                  aria-disabled={pillDisabled}
                  onClick={() => handleStatusChange(opt.value)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-all duration-200",
                    pillDisabled
                      ? "cursor-not-allowed opacity-50"
                      : "cursor-pointer",
                    isActive
                      ? opt.colorClass
                      : "text-muted-foreground/40 hover:text-muted-foreground/70",
                    pillDisabled &&
                      !isActive &&
                      "hover:text-muted-foreground/40",
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
          <Label
            htmlFor={descriptionFieldId}
            className="mb-2 block font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground"
          >
            Description
          </Label>
          <Textarea
            id={descriptionFieldId}
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            onBlur={commitDescription}
            onKeyDown={(e) =>
              handleKeyDownRevert(e, () =>
                setEditDescription(todo.description ?? ""),
              )
            }
            readOnly={!isEditable}
            aria-readonly={!isEditable}
            placeholder={isEditable ? "Add a description..." : ""}
            className={cn(
              "min-h-16 resize-none rounded-lg border border-border/20 bg-muted/30 px-3 py-2.5 text-sm shadow-none",
              "text-foreground outline-none transition-colors placeholder:text-muted-foreground/40",
              "focus-visible:border-primary/40 focus-visible:ring-0",
              !isEditable && "cursor-not-allowed opacity-70",
            )}
          />
        </div>

        {/* Links */}
        <div className="space-y-3">
          <Label
            htmlFor={githubUrlFieldId}
            className="block font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground"
          >
            Links
          </Label>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-muted-foreground/60">
                GITHUB
              </span>
              <Input
                id={githubUrlFieldId}
                value={editGithubUrl}
                onChange={(e) => setEditGithubUrl(e.target.value)}
                onBlur={commitGithubUrl}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                  handleKeyDownRevert(e, () =>
                    setEditGithubUrl(todo.githubUrl ?? ""),
                  );
                }}
                readOnly={!isEditable}
                aria-readonly={!isEditable}
                placeholder={isEditable ? "https://github.com/owner/repo" : ""}
                className={cn(
                  "h-auto min-w-0 flex-1 truncate rounded-lg border border-border/20 bg-muted/30 px-3 py-2 text-sm shadow-none outline-none transition-colors placeholder:text-muted-foreground/40 focus-visible:border-primary/40 focus-visible:ring-0",
                  !isEditable && "cursor-not-allowed opacity-70",
                )}
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
                  className="flex min-w-0 items-center gap-1 truncate text-sm text-col-completed hover:opacity-80"
                >
                  <span className="truncate">{todo.prUrl}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
            )}
            {sandbox?.opencode?.url && (
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground/60">
                  OPENCODE
                </span>
                <a
                  href={sandbox.opencode.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 truncate text-sm text-[--col-inprogress] hover:opacity-80"
                >
                  {sandbox.opencode.url}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 border-t border-border/20 pt-4">
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link href={`/todos/${todo._id}`}>
              Open page
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <div className="ml-auto">
            {showDeleteConfirm ? (
              <div className="flex items-center gap-3">
                <span className="font-mono text-[10px] text-muted-foreground/60 uppercase tracking-widest">
                  Delete?
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

    </div>
  );
}
