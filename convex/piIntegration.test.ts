/// <reference types="vite/client" />

import type { Sandbox } from "@vercel/sandbox";
import { convexTest, type TestConvex } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import type {
  PiCommandClient,
  PiCommandLogChunk,
} from "./lib/piStreamMonitor";

const sandboxMocks = vi.hoisted(() => ({
  getSandbox: vi.fn(),
  stopSandboxSafely: vi.fn(async () => {}),
}));
const pullRequestMocks = vi.hoisted(() => ({
  createPullRequest: vi.fn(),
}));

vi.mock("./lib/sandboxHelpers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/sandboxHelpers")>()),
  getSandbox: sandboxMocks.getSandbox,
  stopSandboxSafely: sandboxMocks.stopSandboxSafely,
}));

vi.mock("./lib/pullRequest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/pullRequest")>()),
  createPullRequest: pullRequestMocks.createPullRequest,
}));

const modules = import.meta.glob("./**/*.ts");

function createCommand(
  chunks: PiCommandLogChunk[],
  exitCode = 0,
): PiCommandClient {
  return {
    logs: vi.fn(() =>
      (async function* () {
        for (const chunk of chunks) yield chunk;
      })(),
    ),
    wait: vi.fn(async () => ({ exitCode })),
    kill: vi.fn(async () => {}),
  };
}

function createSandbox(command: PiCommandClient) {
  return {
    createdAt: new Date(),
    timeout: 30 * 60_000,
    getCommand: vi.fn(async () => command),
    extendTimeout: vi.fn(async () => {}),
  } as unknown as Sandbox;
}

async function insertActivePiAttempt(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    const todoId = await ctx.db.insert("todos", {
      title: "Exercise the Pi adapter",
      status: "INPROGRESS",
      githubUrl: "https://github.com/k-dang/mission-control",
    });
    const attemptId = await ctx.db.insert("todoAttempts", {
      todoId,
      harnessId: "pi",
      runConfiguration: {
        harnessId: "pi",
        providerId: "openrouter",
        modelId: "cohere/north-mini-code:free",
      },
      sandboxId: "sandbox_pi",
      harnessRunId: "command_pi",
      startedAt: Date.now(),
      streamState: "STARTED",
    });
    await ctx.db.patch("todos", todoId, { activeAttemptId: attemptId });
    return { attemptId, todoId };
  });
}

async function readOutcome(
  t: TestConvex<typeof schema>,
  ids: { attemptId: Id<"todoAttempts">; todoId: Id<"todos"> },
) {
  return await t.run(async (ctx) => ({
    attempt: await ctx.db.get("todoAttempts", ids.attemptId),
    events: await ctx.db
      .query("todoEvents")
      .withIndex("by_attemptId", (q) => q.eq("attemptId", ids.attemptId))
      .collect(),
    todo: await ctx.db.get("todos", ids.todoId),
  }));
}

describe("Pi production orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records a Pi-reported assistant failure instead of entering the PR flow", async () => {
    const t = convexTest(schema, modules);
    const ids = await insertActivePiAttempt(t);
    const command = createCommand([
      {
        stream: "stdout",
        data: '{"type":"agent_end","willRetry":false,"messages":[{"role":"assistant","stopReason":"error","errorMessage":"provider failed"}]}\n',
      },
    ]);
    sandboxMocks.getSandbox.mockResolvedValue(createSandbox(command));

    await expect(
      t.action(internal.integrations.pi.monitorPiStream, {
        attemptId: ids.attemptId,
      }),
    ).resolves.toBeNull();

    const outcome = await readOutcome(t, ids);
    expect(outcome.attempt).toMatchObject({
      streamState: "FAILED",
      terminalReason: "provider failed",
    });
    expect(outcome.todo).toMatchObject({ status: "FAILED" });
    expect(outcome.todo?.activeAttemptId).toBeUndefined();
    expect(outcome.events).toMatchObject([
      { event: { kind: "error", message: "provider failed" } },
    ]);
    expect(pullRequestMocks.createPullRequest).not.toHaveBeenCalled();
    expect(sandboxMocks.stopSandboxSafely).toHaveBeenCalledOnce();
  });

  it("keeps the Attempt completed but fails the Todo when PR orchestration fails", async () => {
    const t = convexTest(schema, modules);
    const ids = await insertActivePiAttempt(t);
    const command = createCommand([
      { stream: "stdout", data: '{"type":"turn_start"}\n' },
      {
        stream: "stdout",
        data: '{"type":"turn_end","message":{"role":"assistant","stopReason":"stop"}}\n',
      },
    ]);
    sandboxMocks.getSandbox.mockResolvedValue(createSandbox(command));
    pullRequestMocks.createPullRequest.mockRejectedValue(
      new Error("GitHub rejected the push"),
    );

    await expect(
      t.action(internal.integrations.pi.monitorPiStream, {
        attemptId: ids.attemptId,
      }),
    ).resolves.toBeNull();

    const outcome = await readOutcome(t, ids);
    expect(outcome.attempt).toMatchObject({
      streamState: "COMPLETED",
      terminalReason: "Post-run PR creation failed: GitHub rejected the push",
    });
    expect(outcome.todo).toMatchObject({ status: "FAILED" });
    expect(outcome.events).toHaveLength(2);
    expect(pullRequestMocks.createPullRequest).toHaveBeenCalledOnce();
    expect(sandboxMocks.stopSandboxSafely).toHaveBeenCalledOnce();
  });

  it("fails the active Attempt when Sandbox reconnection is lost", async () => {
    const t = convexTest(schema, modules);
    const ids = await insertActivePiAttempt(t);
    sandboxMocks.getSandbox.mockRejectedValue(new Error("Sandbox not found"));

    await expect(
      t.action(internal.integrations.pi.monitorPiStream, {
        attemptId: ids.attemptId,
      }),
    ).rejects.toThrow("Sandbox not found");

    const outcome = await readOutcome(t, ids);
    expect(outcome.attempt).toMatchObject({
      streamState: "FAILED",
      terminalReason: "Sandbox not found",
    });
    expect(outcome.todo).toMatchObject({ status: "FAILED" });
    expect(outcome.todo?.activeAttemptId).toBeUndefined();
    expect(sandboxMocks.stopSandboxSafely).toHaveBeenCalledOnce();
  });
});
