const DEFAULT_MAX_ATTEMPT_DURATION_MS = 30 * 60_000;

export function resolveMaxAttemptDurationMs(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_ATTEMPT_DURATION_MS;
  }
  return parsed;
}

export type AttemptLifetimeDecision =
  | {
      kind: "extend";
      attemptDeadlineAt: number;
      extendByMs: number;
      monitorForMs: number;
    }
  | { kind: "timedOut" };

/**
 * Runs at the start of each monitor slice. The extension is deadline-based
 * (stay two slices ahead of now) rather than a fixed per-slice amount, while
 * both the lease and the final monitor slice are clamped to the absolute
 * Attempt deadline.
 */
export function decideAttemptLifetime(args: {
  startedAt: number;
  now: number;
  maxAttemptDurationMs: number;
  sandboxDeadlineAt: number;
  monitorSliceMs: number;
}): AttemptLifetimeDecision {
  const attemptDeadlineAt = args.startedAt + args.maxAttemptDurationMs;
  const remainingMs = attemptDeadlineAt - args.now;
  if (remainingMs <= 0) {
    return { kind: "timedOut" };
  }
  const desiredDeadlineAt = Math.min(
    attemptDeadlineAt,
    args.now + 2 * args.monitorSliceMs,
  );
  return {
    kind: "extend",
    attemptDeadlineAt,
    extendByMs: Math.max(0, desiredDeadlineAt - args.sandboxDeadlineAt),
    monitorForMs: Math.min(args.monitorSliceMs, remainingMs),
  };
}
