/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const identity = { subject: "user_1" };
const OPENROUTER_CONFIGURATION = {
  harnessId: "opencode" as const,
  providerId: "openrouter" as const,
  modelId: "moonshotai/kimi-k2.6:free",
};

async function insertTodo(
  t: TestConvex<typeof schema>,
  fields: {
    status?: "TODO" | "INPROGRESS" | "COMPLETED" | "FAILED";
    githubUrl?: string;
    title?: string;
  } = {},
) {
  return await t.run(async (ctx) =>
    await ctx.db.insert("todos", {
      title: fields.title ?? "Implement attempt history",
      status: fields.status ?? "TODO",
      githubUrl: fields.githubUrl,
    }),
  );
}

describe("todo run start transition", () => {
  it("creates one active Attempt and returns it when the Todo Task is started again", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(identity);
    const todoId = await insertTodo(t, { githubUrl: "https://github.com/example/repo" });

    const first = await authed.mutation(api.todoRuns.start, { todoId, runConfiguration: OPENROUTER_CONFIGURATION });
    const second = await authed.mutation(api.todoRuns.start, { todoId, runConfiguration: OPENROUTER_CONFIGURATION });
    const attempt = await authed.query(api.todoAttempts.getLatestForTodo, { todoId });
    const rawTodo = await t.run(async (ctx) => await ctx.db.get("todos", todoId));

    expect(first).toMatchObject({ todoId, status: "INPROGRESS", orchestration: "scheduled" });
    expect(second).toMatchObject({ attemptId: first.attemptId, orchestration: "alreadyStarted" });
    expect(attempt).toMatchObject({
      _id: first.attemptId,
      todoId,
      streamState: "IDLE",
      runConfiguration: OPENROUTER_CONFIGURATION,
    });
    expect(rawTodo?.activeAttemptId).toBe(first.attemptId);
  });

  it("rejects an unsupported Run Configuration before creating an Attempt", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(identity);
    const todoId = await insertTodo(t);

    await expect(
      authed.mutation(api.todoRuns.start, {
        todoId,
        runConfiguration: { providerId: "openrouter", modelId: "moonshotai/kimi-k2.5" },
      }),
    ).rejects.toThrow("Unsupported run configuration: opencode/openrouter/moonshotai/kimi-k2.5");

    expect(await authed.query(api.todoAttempts.getLatestForTodo, { todoId })).toBeNull();
    expect((await authed.query(api.todos.get, { todoId }))?.status).toBe("TODO");
  });

  it("allows a failed Todo Task to be edited and creates a new Attempt on retry", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(identity);
    const todoId = await insertTodo(t);
    const first = await authed.mutation(api.todoRuns.start, { todoId, runConfiguration: OPENROUTER_CONFIGURATION });

    await t.mutation(internal.todoRuns.failOrchestration, {
      attemptId: first.attemptId,
      reason: "Sandbox provisioning failed",
    });
    await authed.mutation(api.todoRuns.updateDraft, { todoId, title: "Retry with clarified scope" });
    const second = await authed.mutation(api.todoRuns.start, {
      todoId,
      runConfiguration: {
        harnessId: "opencode",
        providerId: "vercel",
        modelId: "moonshotai/kimi-k2.5",
      },
    });

    const raw = await t.run(async (ctx) =>
      await ctx.db.query("todoAttempts").withIndex("by_todoId", (q) => q.eq("todoId", todoId)).collect(),
    );
    const todo = await authed.query(api.todos.get, { todoId });
    expect(second.attemptId).not.toBe(first.attemptId);
    expect(raw).toHaveLength(2);
    expect(raw.find((attempt) => attempt._id === first.attemptId)).toMatchObject({ streamState: "FAILED" });
    expect(todo).toMatchObject({ status: "INPROGRESS", title: "Retry with clarified scope" });
  });

  it("rejects callbacks from an older Attempt after a retry owns the active slot", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(identity);
    const todoId = await insertTodo(t);
    const first = await authed.mutation(api.todoRuns.start, {
      todoId,
      runConfiguration: OPENROUTER_CONFIGURATION,
    });
    await t.mutation(internal.todoRuns.failOrchestration, {
      attemptId: first.attemptId,
      reason: "Provisioning failed",
    });
    const retry = await authed.mutation(api.todoRuns.start, {
      todoId,
      runConfiguration: OPENROUTER_CONFIGURATION,
    });

    await expect(
      t.mutation(internal.todoRuns.recordSandboxReady, {
        attemptId: first.attemptId,
        sandboxId: "sandbox_stale",
      }),
    ).resolves.toBe(false);
    const rawTodo = await t.run(async (ctx) => await ctx.db.get("todos", todoId));
    const oldAttempt = await t.run(async (ctx) =>
      await ctx.db.get("todoAttempts", first.attemptId),
    );
    expect(rawTodo?.activeAttemptId).toBe(retry.attemptId);
    expect(oldAttempt?.sandboxId).toBeUndefined();
  });
});

describe("Retryable Attempts", () => {
  it("blocks draft edits while a Todo Task is active or terminally completed", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(identity);
    const todoId = await insertTodo(t);
    const started = await authed.mutation(api.todoRuns.start, { todoId, runConfiguration: OPENROUTER_CONFIGURATION });

    await expect(
      authed.mutation(api.todoRuns.updateDraft, { todoId, title: "Edit while running" }),
    ).rejects.toThrow("Todo fields can only be edited before an Attempt starts or after it fails.");

    await t.mutation(internal.todoRuns.finish, {
      attemptId: started.attemptId,
      streamState: "COMPLETED",
      todoStatus: "COMPLETED",
      terminalAt: 1234,
    });

    await expect(
      authed.mutation(api.todoRuns.updateDraft, { todoId, title: "Edit after completion" }),
    ).rejects.toThrow("Todo fields can only be edited before an Attempt starts or after it fails.");

    expect(await authed.query(api.todos.get, { todoId })).toMatchObject({
      title: "Implement attempt history",
      status: "COMPLETED",
    });
  });

  it("retries a failed Todo Task with a distinct Attempt while leaving the prior Attempt's context, Run Configuration, events, and terminal reason unchanged", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(identity);
    const todoId = await insertTodo(t);
    const first = await authed.mutation(api.todoRuns.start, { todoId, runConfiguration: OPENROUTER_CONFIGURATION });

    await t.mutation(internal.todoEvents.append, {
      todoId,
      attemptId: first.attemptId,
      eventKey: "tool:call_1:running",
      event: { kind: "tool", tool: "bash", status: "running" },
    });
    await t.mutation(internal.todoRuns.failOrchestration, {
      attemptId: first.attemptId,
      reason: "Sandbox provisioning failed",
    });

    // The start dialog reads the latest (failed) Attempt's Run Configuration
    // to preselect it before the user confirms a retry.
    expect(await authed.query(api.todoAttempts.getLatestForTodo, { todoId })).toMatchObject({
      _id: first.attemptId,
      runConfiguration: OPENROUTER_CONFIGURATION,
    });

    await authed.mutation(api.todoRuns.updateDraft, {
      todoId,
      title: "Retry with clarified scope",
      description: "Clarified after failure",
      githubUrl: "https://github.com/example/other-repo",
    });

    const NEW_CONFIGURATION = {
      harnessId: "opencode" as const,
      providerId: "opencode" as const,
      modelId: "deepseek-v4-flash-free",
    };
    const second = await authed.mutation(api.todoRuns.start, {
      todoId,
      runConfiguration: NEW_CONFIGURATION,
    });

    expect(second.attemptId).not.toBe(first.attemptId);

    const [rawFirst, rawSecond, firstEvents] = await t.run(async (ctx) => [
      await ctx.db.get("todoAttempts", first.attemptId),
      await ctx.db.get("todoAttempts", second.attemptId),
      await ctx.db
        .query("todoEvents")
        .withIndex("by_attemptId", (q) => q.eq("attemptId", first.attemptId))
        .collect(),
    ]);

    // The prior Attempt keeps its own captured Run Configuration and terminal reason.
    expect(rawFirst).toMatchObject({
      streamState: "FAILED",
      runConfiguration: OPENROUTER_CONFIGURATION,
      terminalReason: "Sandbox provisioning failed",
    });
    // Its events remain attached to it rather than being reassigned to the retry.
    expect(firstEvents).toHaveLength(1);
    expect(firstEvents[0]).toMatchObject({ attemptId: first.attemptId });

    // The retry is a genuinely new Attempt with the newly-selected configuration.
    expect(rawSecond).toMatchObject({
      streamState: "IDLE",
      runConfiguration: NEW_CONFIGURATION,
    });

    const todo = await authed.query(api.todos.get, { todoId });
    expect(todo).toMatchObject({
      status: "INPROGRESS",
      title: "Retry with clarified scope",
      description: "Clarified after failure",
      githubUrl: "https://github.com/example/other-repo",
    });
  });

  it("returns a cancelled Attempt to FAILED, keeps it visible as cancelled, and allows the Todo Task to be edited and retried afterward", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(identity);
    const todoId = await insertTodo(t);
    const first = await authed.mutation(api.todoRuns.start, { todoId, runConfiguration: OPENROUTER_CONFIGURATION });

    await t.mutation(internal.todoRuns.finish, {
      attemptId: first.attemptId,
      streamState: "CANCELLED",
      todoStatus: "FAILED",
      terminalAt: 1234,
      terminalReason: "Operator cancelled the Attempt",
    });

    // No dedicated board status is introduced for cancellation; the Todo Task
    // simply lands in FAILED, editable and retriable like any other failure.
    expect(await authed.query(api.todos.get, { todoId })).toMatchObject({ status: "FAILED" });

    await authed.mutation(api.todoRuns.updateDraft, { todoId, title: "Retry after cancellation" });
    const second = await authed.mutation(api.todoRuns.start, { todoId, runConfiguration: OPENROUTER_CONFIGURATION });

    expect(second.attemptId).not.toBe(first.attemptId);
    const rawFirst = await t.run(async (ctx) => await ctx.db.get("todoAttempts", first.attemptId));
    expect(rawFirst).toMatchObject({
      streamState: "CANCELLED",
      terminalReason: "Operator cancelled the Attempt",
    });
    expect(await authed.query(api.todos.get, { todoId })).toMatchObject({
      status: "INPROGRESS",
      title: "Retry after cancellation",
    });
  });
});

describe("Attempt terminal states", () => {
  it("stores projected events and tool-call counts against the app-owned Attempt", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(identity);
    const todoId = await insertTodo(t);
    const started = await authed.mutation(api.todoRuns.start, { todoId, runConfiguration: OPENROUTER_CONFIGURATION });

    await t.mutation(internal.todoEvents.append, {
      todoId,
      attemptId: started.attemptId,
      eventKey: "tool:call_1:running",
      event: { kind: "tool", tool: "bash", status: "running" },
    });

    const events = await authed.query(api.todoEvents.listRecentForTodo, { todoId });
    const count = await authed.query(api.toolCallCounts.getForTodo, { todoId });
    expect(events).toMatchObject([{ attemptId: started.attemptId }]);
    expect(count).toMatchObject({ attemptId: started.attemptId, count: 1 });
  });

  it("maps a cancelled Attempt to a failed Todo Task while retaining the cancellation", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(identity);
    const todoId = await insertTodo(t);
    const started = await authed.mutation(api.todoRuns.start, { todoId, runConfiguration: OPENROUTER_CONFIGURATION });

    await t.mutation(internal.todoRuns.finish, {
      attemptId: started.attemptId,
      streamState: "CANCELLED",
      todoStatus: "FAILED",
      terminalAt: 1234,
      terminalReason: "Operator cancelled the Attempt",
    });

    expect(await authed.query(api.todoAttempts.getLatestForTodo, { todoId })).toMatchObject({
      streamState: "CANCELLED",
      terminalReason: "Operator cancelled the Attempt",
    });
    expect((await authed.query(api.todos.get, { todoId }))?.status).toBe("FAILED");
    const rawTodo = await t.run(async (ctx) => await ctx.db.get("todos", todoId));
    expect(rawTodo?.activeAttemptId).toBeUndefined();
  });
});

describe("deleting Todo Tasks", () => {
  it("releases the active slot and cancels its Attempt before batched deletion", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(identity);
    const todoId = await insertTodo(t);
    const started = await authed.mutation(api.todoRuns.start, {
      todoId,
      runConfiguration: OPENROUTER_CONFIGURATION,
    });
    await t.mutation(internal.todoRuns.recordSandboxReady, {
      attemptId: started.attemptId,
      sandboxId: "sandbox_to_stop",
    });
    await t.run(async (ctx) => {
      for (let index = 0; index <= 100; index += 1) {
        await ctx.db.insert("todoEvents", {
          todoId,
          attemptId: started.attemptId,
          eventKey: `event:${index}`,
          event: { kind: "session_compacted" },
        });
      }
    });

    await authed.mutation(api.todoRuns.remove, { todoId });

    const result = await t.run(async (ctx) => ({
      todo: await ctx.db.get("todos", todoId),
      attempt: await ctx.db.get("todoAttempts", started.attemptId),
    }));
    expect(result.todo).toMatchObject({ deleting: true });
    expect(result.todo?.activeAttemptId).toBeUndefined();
    expect(result.attempt).toMatchObject({
      streamState: "CANCELLED",
      terminalReason: "Todo deleted",
    });
  });

  it("blocks lifecycle changes while deletion is in progress", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(identity);
    const todoId = await t.run(async (ctx) =>
      await ctx.db.insert("todos", {
        title: "Deleting task",
        status: "FAILED",
        deleting: true,
      }),
    );

    await expect(
      authed.mutation(api.todoRuns.start, {
        todoId,
        runConfiguration: OPENROUTER_CONFIGURATION,
      }),
    ).rejects.toThrow("Todo is being deleted.");
    await expect(
      authed.mutation(api.todoRuns.updateDraft, {
        todoId,
        title: "Do not update",
      }),
    ).rejects.toThrow("Todo is being deleted.");
  });

  it("rejects late Sandbox and OpenCode registration after deletion begins", async () => {
    const t = convexTest(schema, modules);
    const todoId = await t.run(async (ctx) => {
      const todoId = await ctx.db.insert("todos", {
        title: "Deleting task",
        status: "INPROGRESS",
        deleting: true,
      });
      const attemptId = await ctx.db.insert("todoAttempts", {
        todoId,
        harnessId: "opencode",
        runConfiguration: OPENROUTER_CONFIGURATION,
        streamState: "IDLE",
      });
      return { todoId, attemptId };
    });

    await expect(
      t.mutation(internal.todoRuns.recordSandboxReady, {
        attemptId: todoId.attemptId,
        sandboxId: "sandbox_late",
      }),
    ).resolves.toBe(false);
    await expect(
      t.mutation(internal.todoRuns.recordOpencodeStarted, {
        attemptId: todoId.attemptId,
        opencodeUrl: "https://opencode.example",
        sessionId: "session_late",
        startedAt: 1234,
      }),
    ).resolves.toBe(false);
  });
});
