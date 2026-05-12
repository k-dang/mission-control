"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/utils";
import {
  ArrowLeft,
  GitBranch,
  GitPullRequest,
  LoaderCircle,
  Play,
  Signal,
  Wrench,
} from "lucide-react";
import { LinkChannel } from "@/components/todo-detail/link-channel";
import { RadarWidget } from "@/components/todo-detail/radar-widget";
import {
  formatAbsoluteTimestamp,
  STATUS_META,
  TITLE_DIVIDER_TICKS,
  type DossierStyle,
} from "@/components/todo-detail/todo-detail-constants";
import { TransmissionLog } from "@/components/todo-detail/transmission-log";

export function TodoDetailPageClient({ todoId }: { todoId: Id<"todos"> }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const todo = useQuery(api.todos.get, isAuthenticated ? { todoId } : "skip");
  const todoEvents = useQuery(
    api.todoEvents.listRecentForTodo,
    isAuthenticated ? { todoId } : "skip",
  );
  const updateTodo = useMutation(api.todos.update);
  const toolCallCount = useQuery(
    api.opencodeToolCallCounts.getForTodo,
    isAuthenticated ? { todoId } : "skip",
  );
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const orderedEvents = useMemo(() => {
    if (todoEvents === undefined) return [];
    return [...todoEvents].sort((a, b) => a._creationTime - b._creationTime);
  }, [todoEvents]);
  const hasTransmission = orderedEvents.length > 0;

  const transmissionListRef = useRef<HTMLUListElement>(null);
  const stickToTransmissionEndRef = useRef(true);

  useEffect(() => {
    stickToTransmissionEndRef.current = true;
  }, [todoId]);

  useEffect(() => {
    const el = transmissionListRef.current;
    if (!el || orderedEvents.length === 0) return;
    if (!stickToTransmissionEndRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [orderedEvents]);

  const onTransmissionListScroll = useCallback(() => {
    const el = transmissionListRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickToTransmissionEndRef.current = nearBottom;
  }, []);

  const handleStartTodo = async () => {
    if (isStarting) return;

    setIsStarting(true);
    setStartError(null);

    try {
      await updateTodo({ todoId, status: "INPROGRESS" });
    } catch (error) {
      setStartError(
        error instanceof Error ? error.message : "Could not start todo.",
      );
    } finally {
      setIsStarting(false);
    }
  };

  const startButtonContent = (
    <>
      {isStarting ? (
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Play className="h-3.5 w-3.5" />
      )}
      Start
    </>
  );

  if (isLoading) {
    return (
      <main className="grain-overlay relative min-h-screen">
        <div className="ambient-bg" />
        <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-6 pt-16 md:p-10">
          <div className="h-9 w-40 animate-pulse rounded-md bg-muted/30" />
          <div className="h-10 w-full animate-pulse rounded bg-muted/20" />
          <div className="rounded-3xl border border-border/30 bg-card/30 p-10">
            <div className="h-4 w-28 animate-pulse rounded bg-muted/30" />
            <div className="mt-4 h-12 w-2/3 animate-pulse rounded bg-muted/30" />
            <div className="mt-10 grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
              <div className="space-y-3">
                <div className="h-4 w-full animate-pulse rounded bg-muted/20" />
                <div className="h-4 w-11/12 animate-pulse rounded bg-muted/20" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted/20" />
              </div>
              <div className="h-40 animate-pulse rounded-lg bg-muted/15" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!isAuthenticated || todo === undefined) {
    return null;
  }

  if (!todo) {
    return (
      <main className="grain-overlay relative min-h-screen">
        <div className="ambient-bg" />
        <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 p-6 pt-16 md:p-10">
          <Link
            href="/"
            className="flex w-fit items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Return to command
          </Link>
          <section className="relative overflow-hidden rounded-3xl border border-destructive/30 bg-card p-10">
            <div
              className="absolute inset-0 dossier-grid opacity-40"
              aria-hidden
            />
            <div className="relative">
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-destructive/80">
                · SIGNAL LOST //·// TRANSMISSION INVALID
              </p>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
                This dossier does not exist.
              </h1>
              <p className="mt-4 max-w-2xl font-mono text-xs leading-6 text-muted-foreground">
                The requested mission record is unreachable. It may have been
                decommissioned, or the link you followed is stale.
              </p>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const status = STATUS_META[todo.status];
  const StatusIcon = status.icon;
  const hasUplinks = Boolean(todo.githubUrl || todo.prUrl);
  const dossierStyle: DossierStyle = { "--dossier-accent": status.accent };

  return (
    <main className="grain-overlay relative min-h-screen">
      <div className="ambient-bg" />
      {/* Status-tinted glow behind the dossier */}
      <div
        className="pointer-events-none fixed inset-x-0 z-0 h-105"
        style={{
          background: `radial-gradient(ellipse 60% 70% at 50% 0%, ${status.accentGlow} 0%, transparent 70%)`,
        }}
        aria-hidden
      />

      <div
        className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-6 pt-16 md:p-10"
        style={dossierStyle}
      >
        {/* Top row: back + dossier tag */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="flex w-fit items-center gap-2 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Return to command
          </Link>
          <div className="hidden items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/60 md:flex">
            <Signal className="h-3 w-3" />
            <span>clearance</span>
            <span className="text-foreground/80">level · alpha</span>
            <span className="text-muted-foreground/30">/</span>
            <span>dossier — encrypted</span>
          </div>
        </div>

        {/* Main dossier */}
        <section className="dossier-corners relative overflow-hidden rounded-2xl border border-border/40 bg-card">
          <span className="corner-tl" aria-hidden />
          <span className="corner-tr" aria-hidden />

          {/* Header band — status + radar + codename */}
          <div className="relative border-b border-border/30 px-6 pb-6 pt-8 md:px-10 md:pt-10">
            <div
              className="absolute inset-x-0 top-0 h-px"
              style={{
                background: `linear-gradient(90deg, transparent 0%, ${status.accent} 30%, ${status.accent} 70%, transparent 100%)`,
                opacity: 0.6,
              }}
              aria-hidden
            />
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="min-w-0 flex-1">
                {/* Status badge */}
                <div
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1"
                  style={{
                    background: status.accentSoft,
                    borderColor: `${status.accent}55`,
                    boxShadow: `0 0 18px ${status.accentGlow}`,
                  }}
                >
                  <StatusIcon className={`h-3 w-3 ${status.textClass}`} />
                  <span
                    className={`font-mono text-[10px] font-bold uppercase tracking-[0.22em] ${status.textClass}`}
                  >
                    {status.label}
                  </span>
                  <span
                    className="h-1 w-1 rounded-full"
                    style={{ background: status.accent }}
                  />
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70">
                    {todo.status}
                  </span>
                </div>

                <div className="mt-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground/60">
                    <span style={{ color: status.accent }}>{"//"}</span> title
                  </p>
                  <h1 className="mt-2 max-w-3xl text-balance text-[32px] font-semibold leading-[1.08] tracking-tight text-foreground md:text-[44px]">
                    {todo.title}
                  </h1>
                </div>

                {/* Tick-mark divider */}
                <div
                  className="mt-6 flex h-3 items-center gap-0.75"
                  aria-hidden
                >
                  {TITLE_DIVIDER_TICKS.map((tick, i) => (
                    <span
                      key={i}
                      className="block w-px bg-border/60"
                      style={tick}
                    />
                  ))}
                </div>
              </div>

              <div className="hidden shrink-0 md:block">
                <RadarWidget accent={status.accent} />
              </div>
            </div>
          </div>

          {/* Body: briefing + telemetry */}
          <div className="grid gap-0 md:grid-cols-[minmax(0,1.7fr)_minmax(17rem,1fr)]">
            {/* Briefing */}
            <div className="dossier-grid border-b border-border/30 px-6 py-8 md:border-b-0 md:border-r md:px-10 md:py-10">
              <div className="flex items-center gap-3">
                <span
                  className="h-px w-6"
                  style={{ background: status.accent, opacity: 0.7 }}
                />
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground/70">
                  description
                </p>
                <span className="h-px flex-1 bg-border/40" />
                <span className="font-mono text-[9px] uppercase tracking-[0.26em] text-muted-foreground/40">
                  01
                </span>
              </div>

              {todo.description?.trim() ? (
                <p className="mt-5 whitespace-pre-wrap text-[15px] leading-[1.75] text-foreground/90">
                  {todo.description}
                </p>
              ) : (
                <div className="mt-5 rounded-md border border-dashed border-border/40 px-4 py-8 text-center">
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/60">
                    · no briefing filed ·
                  </p>
                  <p className="mt-2 font-mono text-[11px] text-muted-foreground/50">
                    Operative has not provided additional context.
                  </p>
                </div>
              )}
            </div>

            {/* Telemetry */}
            <aside className="relative px-6 py-8 md:px-8 md:py-10">
              <div className="flex items-center gap-3">
                <span
                  className="h-px w-6"
                  style={{ background: status.accent, opacity: 0.7 }}
                />
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground/70">
                  Telemetry
                </p>
                <span className="h-px flex-1 bg-border/40" />
                <span className="font-mono text-[9px] uppercase tracking-[0.26em] text-muted-foreground/40">
                  02
                </span>
              </div>

              <dl className="mt-5 space-y-4 font-mono text-[11px]">
                <div>
                  <dt className="text-[9px] uppercase tracking-[0.24em] text-muted-foreground/50">
                    _id
                  </dt>
                  <dd className="mt-1 break-all text-foreground/85">
                    {todo._id}
                  </dd>
                </div>
                <div className="h-px bg-border/30" />
                <div>
                  <dt className="text-[9px] uppercase tracking-[0.24em] text-muted-foreground/50">
                    _creationTime
                  </dt>
                  <dd className="mt-1 text-foreground/85">
                    {formatRelativeTime(todo._creationTime)}
                  </dd>
                  <dd className="mt-0.5 text-[10px] text-muted-foreground/60">
                    {formatAbsoluteTimestamp(todo._creationTime)}
                  </dd>
                </div>
                <div className="h-px bg-border/30" />
                <div>
                  <dt className="text-[9px] uppercase tracking-[0.24em] text-muted-foreground/50">
                    status
                  </dt>
                  <dd
                    className="mt-1 flex items-center gap-2"
                    style={{ color: status.accent }}
                  >
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{
                        background: status.accent,
                        boxShadow: `0 0 8px ${status.accent}`,
                      }}
                    />
                    {todo.status}
                  </dd>
                </div>
                {todo.status === "TODO" ? (
                  <>
                    <div className="h-px bg-border/30" />
                    <div>
                      <dt className="text-[9px] uppercase tracking-[0.24em] text-muted-foreground/50">
                        action
                      </dt>
                      <dd className="mt-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleStartTodo}
                          disabled={isStarting}
                          className="w-full border border-col-inprogress/30 bg-col-inprogress/15 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-col-inprogress hover:bg-col-inprogress/20"
                        >
                          {startButtonContent}
                        </Button>
                        {startError ? (
                          <p className="mt-2 font-mono text-[10px] leading-4 text-destructive">
                            {startError}
                          </p>
                        ) : null}
                      </dd>
                    </div>
                  </>
                ) : null}
              </dl>
            </aside>
          </div>

          {/* Uplink channels */}
          <div className="border-t border-border/30 px-6 py-8 md:px-10">
            <div className="flex items-center gap-3">
              <span
                className="h-px w-6"
                style={{ background: status.accent, opacity: 0.7 }}
              />
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground/70">
                Uplink Channels
              </p>
              <span className="h-px flex-1 bg-border/40" />
              <span className="font-mono text-[9px] uppercase tracking-[0.26em] text-muted-foreground/40">
                03
              </span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {todo.githubUrl ? (
                <LinkChannel
                  codename="link"
                  channel="githubUrl"
                  url={todo.githubUrl}
                  icon={GitBranch}
                />
              ) : null}
              {todo.prUrl ? (
                <LinkChannel
                  codename="link"
                  channel="prUrl"
                  url={todo.prUrl}
                  icon={GitPullRequest}
                />
              ) : null}
              {!hasUplinks ? (
                <div className="col-span-full rounded-md border border-dashed border-border/40 px-4 py-6 text-center">
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/60">
                    · no channels attached ·
                  </p>
                  <p className="mt-2 font-mono text-[11px] text-muted-foreground/50">
                    Attach a GitHub URL from the task panel to establish uplink.
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          {hasTransmission ? (
            <div className="border-t border-border/30 px-6 py-8 md:px-10">
              <div className="flex items-center gap-3">
                <span
                  className="h-px w-6"
                  style={{ background: status.accent, opacity: 0.7 }}
                />
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground/70">
                  Transmission log
                </p>
                <span className="h-px flex-1 bg-border/40" />
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded border border-border/30 bg-background/25 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/65">
                  <Wrench
                    className="h-3 w-3"
                    style={{ color: status.accent }}
                    aria-hidden
                  />
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {toolCallCount === undefined
                      ? "--"
                      : (toolCallCount?.count ?? 0)}
                  </span>
                  <span>tool calls</span>
                </span>
                <span className="font-mono text-[9px] uppercase tracking-[0.26em] text-muted-foreground/40">
                  04
                </span>
              </div>

              <TransmissionLog
                events={orderedEvents}
                listRef={transmissionListRef}
                onScroll={onTransmissionListScroll}
              />
            </div>
          ) : null}
        </section>

        {/* Footer readout */}
        <footer className="flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/60">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-col-completed" />
            <span>system nominal</span>
            <span className="text-muted-foreground/30">{"//"}</span>
            <span>autosync engaged</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground/50">end of dossier</span>
            <span
              className="h-px w-10"
              style={{ background: status.accent, opacity: 0.5 }}
            />
            <span style={{ color: status.accent }}>·</span>
          </div>
        </footer>
      </div>
    </main>
  );
}
