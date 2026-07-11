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
