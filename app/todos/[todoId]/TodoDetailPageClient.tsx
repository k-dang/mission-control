"use client";

import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  RotateCw,
  XCircle,
} from "lucide-react";

const STATUS_META = {
  TODO: {
    label: "TODO",
    colorClass: "text-col-todo",
    icon: Circle,
  },
  INPROGRESS: {
    label: "IN PROGRESS",
    colorClass: "text-col-inprogress",
    icon: RotateCw,
  },
  COMPLETED: {
    label: "COMPLETED",
    colorClass: "text-col-completed",
    icon: CheckCircle2,
  },
  FAILED: {
    label: "FAILED",
    colorClass: "text-col-failed",
    icon: XCircle,
  },
} as const;

export function TodoDetailPageClient({
  todoId,
}: {
  todoId: Id<"todos">;
}) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const todo = useQuery(api.todos.get, isAuthenticated ? { todoId } : "skip");

  if (isLoading) {
    return (
      <main className="grain-overlay relative min-h-screen">
        <div className="ambient-bg" />
        <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 p-6 md:p-10">
          <div className="h-9 w-32 animate-pulse rounded-md bg-muted/30" />
          <div className="rounded-3xl border border-border/30 bg-card/30 p-8">
            <div className="h-5 w-28 animate-pulse rounded bg-muted/30" />
            <div className="mt-4 h-10 w-2/3 animate-pulse rounded bg-muted/30" />
            <div className="mt-8 space-y-3">
              <div className="h-4 w-full animate-pulse rounded bg-muted/20" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-muted/20" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted/20" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (todo === undefined) {
    return null;
  }

  if (!todo) {
    return (
      <main className="grain-overlay relative min-h-screen">
        <div className="ambient-bg" />
        <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 p-6 md:p-10">
          <Button asChild variant="ghost" className="w-fit">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Back to board
            </Link>
          </Button>
          <section className="glass-card rounded-3xl border border-border/40 bg-card/60 p-8 backdrop-blur-xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Todo not found
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
              This task doesn&apos;t exist anymore.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              It may have been deleted or the link may be invalid.
            </p>
          </section>
        </div>
      </main>
    );
  }

  const status = STATUS_META[todo.status];
  const StatusIcon = status.icon;

  return (
    <main className="grain-overlay relative min-h-screen">
      <div className="ambient-bg" />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 p-6 md:p-10">
        <Button asChild variant="ghost" className="w-fit">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Back to board
          </Link>
        </Button>

        <section className="glass-card rounded-3xl border border-border/40 bg-card/60 p-8 backdrop-blur-xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <StatusIcon className={`h-4 w-4 ${status.colorClass}`} />
                <span
                  className={`font-mono text-[11px] font-bold uppercase tracking-[0.18em] ${status.colorClass}`}
                >
                  {status.label}
                </span>
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                {todo.title}
              </h1>
            </div>

            <div className="flex items-center gap-2 text-muted-foreground/70">
              <Clock className="h-4 w-4" />
              <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
                Created {formatRelativeTime(todo._creationTime)}
              </span>
            </div>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
            <div className="space-y-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Description
              </p>
              <div className="rounded-2xl border border-border/30 bg-muted/20 p-4 text-sm leading-6 text-foreground/90">
                {todo.description?.trim() ? (
                  <p className="whitespace-pre-wrap">{todo.description}</p>
                ) : (
                  <p className="text-muted-foreground">No description yet.</p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Links
              </p>
              <div className="space-y-3 rounded-2xl border border-border/30 bg-muted/20 p-4">
                {todo.githubUrl ? (
                  <a
                    href={todo.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start justify-between gap-3 rounded-xl border border-border/20 bg-background/30 px-3 py-2 text-sm text-foreground transition-colors hover:border-primary/30 hover:bg-background/50"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        GitHub
                      </p>
                      <p className="truncate">{todo.githubUrl}</p>
                    </div>
                    <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  </a>
                ) : null}

                {todo.prUrl ? (
                  <a
                    href={todo.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start justify-between gap-3 rounded-xl border border-border/20 bg-background/30 px-3 py-2 text-sm text-foreground transition-colors hover:border-primary/30 hover:bg-background/50"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        Pull request
                      </p>
                      <p className="truncate">{todo.prUrl}</p>
                    </div>
                    <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  </a>
                ) : null}

                {!todo.githubUrl && !todo.prUrl ? (
                  <p className="text-sm text-muted-foreground">
                    No links attached to this task yet.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
