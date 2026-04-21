"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  RotateCw,
  Signal,
  XCircle,
} from "lucide-react";

type Status = Doc<"todos">["status"];

const STATUS_META: Record<
  Status,
  {
    label: string;
    codename: string;
    textClass: string;
    accent: string;
    accentSoft: string;
    accentGlow: string;
    icon: typeof Circle;
  }
> = {
  TODO: {
    label: "STANDBY",
    codename: "CODE-01 / STANDBY",
    textClass: "text-col-todo",
    accent: "oklch(0.75 0.15 55)",
    accentSoft: "oklch(0.75 0.15 55 / 14%)",
    accentGlow: "oklch(0.75 0.15 55 / 22%)",
    icon: Circle,
  },
  INPROGRESS: {
    label: "IN FLIGHT",
    codename: "CODE-02 / IN-FLIGHT",
    textClass: "text-col-inprogress",
    accent: "oklch(0.65 0.17 250)",
    accentSoft: "oklch(0.65 0.17 250 / 14%)",
    accentGlow: "oklch(0.65 0.17 250 / 22%)",
    icon: RotateCw,
  },
  COMPLETED: {
    label: "RECOVERED",
    codename: "CODE-03 / RECOVERED",
    textClass: "text-col-completed",
    accent: "oklch(0.68 0.14 155)",
    accentSoft: "oklch(0.68 0.14 155 / 14%)",
    accentGlow: "oklch(0.68 0.14 155 / 22%)",
    icon: CheckCircle2,
  },
  FAILED: {
    label: "LOST",
    codename: "CODE-04 / SIGNAL-LOST",
    textClass: "text-col-failed",
    accent: "oklch(0.62 0.2 25)",
    accentSoft: "oklch(0.62 0.2 25 / 14%)",
    accentGlow: "oklch(0.62 0.2 25 / 22%)",
    icon: XCircle,
  },
};

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hrs = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const hh = String(hrs).padStart(2, "0");
  const mm = String(mins).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  if (days > 0) return `T+${days}D ${hh}:${mm}:${ss}`;
  return `T+${hh}:${mm}:${ss}`;
}

function formatAbsoluteTimestamp(ms: number) {
  const d = new Date(ms);
  const iso = d.toISOString();
  return iso.replace("T", " ").slice(0, 19) + "Z";
}

function useElapsed(startMs: number | undefined) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (startMs === undefined) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startMs]);
  if (startMs === undefined || now === null) return null;
  return now - startMs;
}

function RadarWidget({ accent }: { accent: string }) {
  return (
    <div className="relative flex h-24 w-24 items-center justify-center">
      <svg
        viewBox="0 0 96 96"
        className="radar-pulse absolute inset-0 h-full w-full"
        aria-hidden
      >
        <circle cx="48" cy="48" fill="none" stroke={accent} strokeWidth="1" />
        <circle cx="48" cy="48" fill="none" stroke={accent} strokeWidth="1" />
        <circle cx="48" cy="48" fill="none" stroke={accent} strokeWidth="1" />
      </svg>
      <svg
        viewBox="0 0 96 96"
        className="absolute inset-0 h-full w-full opacity-40"
        aria-hidden
      >
        <circle
          cx="48"
          cy="48"
          r="46"
          fill="none"
          stroke={accent}
          strokeWidth="0.6"
          strokeDasharray="2 4"
        />
        <circle
          cx="48"
          cy="48"
          r="30"
          fill="none"
          stroke={accent}
          strokeWidth="0.6"
          strokeDasharray="2 4"
        />
        <line
          x1="0"
          y1="48"
          x2="96"
          y2="48"
          stroke={accent}
          strokeWidth="0.4"
          strokeDasharray="1 3"
        />
        <line
          x1="48"
          y1="0"
          x2="48"
          y2="96"
          stroke={accent}
          strokeWidth="0.4"
          strokeDasharray="1 3"
        />
      </svg>
      <div
        className="h-2 w-2 rounded-full"
        style={{
          background: accent,
          boxShadow: `0 0 14px ${accent}`,
        }}
        aria-hidden
      />
    </div>
  );
}

function LinkChannel({
  codename,
  channel,
  url,
  icon: Icon,
}: {
  codename: string;
  channel: string;
  url: string;
  icon: typeof GitBranch;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex items-center gap-4 border-l-2 border-border/30 bg-background/30 px-4 py-3 transition-all hover:border-primary/60 hover:bg-background/60"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border/30 bg-muted/30 text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.24em] text-muted-foreground/60">
          <span>{codename}</span>
          <span className="text-muted-foreground/30">{"//"}</span>
          <span className="text-muted-foreground/80">{channel}</span>
        </div>
        <p className="mt-0.5 truncate font-mono text-[11px] text-foreground/85">
          {url.replace(/^https?:\/\//, "")}
        </p>
      </div>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
    </a>
  );
}

export function TodoDetailPageClient({
  todoId,
}: {
  todoId: Id<"todos">;
}) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const todo = useQuery(api.todos.get, isAuthenticated ? { todoId } : "skip");
  const elapsed = useElapsed(todo?._creationTime);

  if (isLoading) {
    return (
      <main className="grain-overlay relative min-h-screen">
        <div className="ambient-bg" />
        <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-6 md:p-10">
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
        <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 p-6 md:p-10">
          <Button asChild variant="ghost" className="w-fit font-mono text-[11px] uppercase tracking-[0.22em]">
            <Link href="/">
              <ArrowLeft className="h-3.5 w-3.5" />
              Return to command
            </Link>
          </Button>
          <section className="relative overflow-hidden rounded-3xl border border-destructive/30 bg-card/60 p-10 backdrop-blur-xl">
            <div className="absolute inset-0 dossier-grid opacity-40" aria-hidden />
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

  return (
    <main className="grain-overlay relative min-h-screen">
      <div className="ambient-bg" />
      {/* Status-tinted glow behind the dossier */}
      <div
        className="pointer-events-none fixed inset-x-0 top-16 z-0 h-[420px]"
        style={{
          background: `radial-gradient(ellipse 60% 70% at 50% 0%, ${status.accentGlow} 0%, transparent 70%)`,
        }}
        aria-hidden
      />

      <div
        className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-6 md:p-10"
        style={{ ["--dossier-accent" as string]: status.accent }}
      >
        {/* Top row: back + dossier tag */}
        <div
          className="reveal flex items-center justify-between"
          style={{ animationDelay: "0ms" }}
        >
          <Button
            asChild
            variant="ghost"
            className="h-auto w-fit gap-2 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground"
          >
            <Link href="/">
              <ArrowLeft className="h-3.5 w-3.5" />
              Return to command
            </Link>
          </Button>
          <div className="hidden items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/60 md:flex">
            <Signal className="h-3 w-3" />
            <span>clearance</span>
            <span className="text-foreground/80">level · alpha</span>
            <span className="text-muted-foreground/30">/</span>
            <span>dossier — encrypted</span>
          </div>
        </div>

        {/* Main dossier */}
        <section
          className="dossier-corners reveal relative overflow-hidden rounded-2xl border border-border/40 bg-card/60 backdrop-blur-xl"
          style={{ animationDelay: "160ms" }}
        >
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
                  className="scan-sweep inline-flex items-center gap-2 rounded-full border px-3 py-1"
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

                <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground/60">
                  <span style={{ color: status.accent }}>{"//"}</span> title
                </p>
                <h1 className="mt-2 max-w-3xl text-balance text-[32px] font-semibold leading-[1.08] tracking-tight text-foreground md:text-[44px]">
                  {todo.title}
                </h1>

                {/* Tick-mark divider */}
                <div
                  className="mt-6 flex h-3 items-center gap-[3px]"
                  aria-hidden
                >
                  {Array.from({ length: 48 }).map((_, i) => (
                    <span
                      key={i}
                      className="block w-px bg-border/60"
                      style={{
                        height:
                          i % 8 === 0 ? "100%" : i % 4 === 0 ? "60%" : "35%",
                        opacity: i % 8 === 0 ? 0.8 : 0.35,
                      }}
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
                  §01
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
                  §02
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
                    elapsed
                  </dt>
                  <dd
                    className="tick-cursor mt-1 text-foreground/85"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {elapsed === null ? "T+--:--:--" : formatElapsed(elapsed)}
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
                §03
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
        </section>

        {/* Footer readout */}
        <footer
          className="reveal flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/60"
          style={{ animationDelay: "260ms" }}
        >
          <div className="flex items-center gap-2">
            <span className="status-beacon" />
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
