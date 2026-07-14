import { describe, expect, it } from "vitest";
import {
  decideAttemptLifetime,
  resolveMaxAttemptDurationMs,
} from "./attemptLifetime";

const MONITOR_SLICE_MS = 120_000;

describe("decideAttemptLifetime", () => {
  it("extends a near-deadline sandbox far enough to stay two slices ahead", () => {
    const now = 1_000 + 5 * 60_000;
    expect(
      decideAttemptLifetime({
        startedAt: 1_000,
        now,
        maxAttemptDurationMs: 30 * 60_000,
        sandboxDeadlineAt: now + 60_000,
        monitorSliceMs: MONITOR_SLICE_MS,
      }),
    ).toEqual({
      kind: "extend",
      attemptDeadlineAt: 1_000 + 30 * 60_000,
      extendByMs: 180_000,
      monitorForMs: MONITOR_SLICE_MS,
    });
  });

  it("requests no extension when the sandbox deadline is already far enough out", () => {
    const now = 1_000 + 5 * 60_000;
    expect(
      decideAttemptLifetime({
        startedAt: 1_000,
        now,
        maxAttemptDurationMs: 30 * 60_000,
        sandboxDeadlineAt: now + 10 * 60_000,
        monitorSliceMs: MONITOR_SLICE_MS,
      }),
    ).toEqual({
      kind: "extend",
      attemptDeadlineAt: 1_000 + 30 * 60_000,
      extendByMs: 0,
      monitorForMs: MONITOR_SLICE_MS,
    });
  });

  it("clamps the final monitor slice and sandbox lease to the absolute deadline", () => {
    const startedAt = 1_000;
    const attemptDeadlineAt = startedAt + 30 * 60_000;
    const now = attemptDeadlineAt - 1_000;

    expect(
      decideAttemptLifetime({
        startedAt,
        now,
        maxAttemptDurationMs: 30 * 60_000,
        sandboxDeadlineAt: now + 500,
        monitorSliceMs: MONITOR_SLICE_MS,
      }),
    ).toEqual({
      kind: "extend",
      attemptDeadlineAt,
      extendByMs: 500,
      monitorForMs: 1_000,
    });
  });

  it("times out an attempt that reaches the maximum duration", () => {
    const now = 1_000 + 30 * 60_000;
    expect(
      decideAttemptLifetime({
        startedAt: 1_000,
        now,
        maxAttemptDurationMs: 30 * 60_000,
        sandboxDeadlineAt: now + 60_000,
        monitorSliceMs: MONITOR_SLICE_MS,
      }),
    ).toEqual({ kind: "timedOut" });
  });
});

describe("resolveMaxAttemptDurationMs", () => {
  it("uses the configured value when set to a positive number of milliseconds", () => {
    expect(resolveMaxAttemptDurationMs("3600000")).toBe(3_600_000);
  });

  it("falls back to the default when unset or invalid", () => {
    expect(resolveMaxAttemptDurationMs(undefined)).toBe(30 * 60_000);
    expect(resolveMaxAttemptDurationMs("not-a-number")).toBe(30 * 60_000);
    expect(resolveMaxAttemptDurationMs("-5")).toBe(30 * 60_000);
  });
});
