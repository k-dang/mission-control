/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const identity = { subject: "user_1" };

async function insertTodo(
  t: TestConvex<typeof schema>,
  fields: {
    status?: "TODO" | "INPROGRESS" | "COMPLETED" | "FAILED";
    githubUrl?: string;
  } = {},
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("todos", {
      title: "Implement run configuration",
      status: fields.status ?? "TODO",
      githubUrl: fields.githubUrl,
    });
  });
}

async function insertSandboxWithoutRunConfiguration(
  t: TestConvex<typeof schema>,
  todoId: Id<"todos">,
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("todoSandboxes", {
      todoId,
      sandboxId: "sandbox_123",
      opencode: {
        streamState: "IDLE",
        shutdownSafe: false,
      },
    });
  });
}

describe("todo run start transition", () => {
  it("records a supported run configuration on the active execution state", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(identity);
    const todoId = await insertTodo(t, {
      githubUrl: "https://github.com/example/repo",
    });
    await insertSandboxWithoutRunConfiguration(t, todoId);

    await authed.mutation(api.todoRuns.start, {
      todoId,
      runConfiguration: {
        providerId: "openrouter",
        modelId: "moonshotai/kimi-k2.6:free",
      },
    });

    const sandbox = await authed.query(api.todoSandboxes.getSandboxForTodo, {
      todoId,
    });
    const todo = await authed.query(api.todos.get, { todoId });
    const rawTodo = await t.run(async (ctx) => await ctx.db.get(todoId));

    expect(todo?.status).toBe("INPROGRESS");
    expect(todo).not.toHaveProperty("runConfiguration");
    expect(rawTodo).not.toHaveProperty("runConfiguration");
    expect(sandbox?.runConfiguration).toEqual({
      providerId: "openrouter",
      modelId: "moonshotai/kimi-k2.6:free",
    });
  });

  it("rejects an unsupported run configuration before changing state", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(identity);
    const todoId = await insertTodo(t, {
      githubUrl: "https://github.com/example/repo",
    });
    await insertSandboxWithoutRunConfiguration(t, todoId);

    await expect(
      authed.mutation(api.todoRuns.start, {
        todoId,
        runConfiguration: {
          providerId: "openrouter",
          modelId: "moonshotai/kimi-k2.5",
        },
      }),
    ).rejects.toThrow(
      "Unsupported run configuration: openrouter/moonshotai/kimi-k2.5",
    );

    const sandbox = await authed.query(api.todoSandboxes.getSandboxForTodo, {
      todoId,
    });
    const todo = await authed.query(api.todos.get, { todoId });
    const rawTodo = await t.run(async (ctx) => await ctx.db.get(todoId));

    expect(todo?.status).toBe("TODO");
    expect(rawTodo).not.toHaveProperty("runConfiguration");
    expect(sandbox?.runConfiguration).toBeUndefined();
  });

  it("returns historical execution rows that do not have run configuration data", async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity(identity);
    const todoId = await insertTodo(t, {
      status: "INPROGRESS",
      githubUrl: "https://github.com/example/repo",
    });
    await insertSandboxWithoutRunConfiguration(t, todoId);

    const sandbox = await authed.query(api.todoSandboxes.getSandboxForTodo, {
      todoId,
    });

    expect(sandbox).toMatchObject({
      todoId,
      sandboxId: "sandbox_123",
      opencode: {
        streamState: "IDLE",
        shutdownSafe: false,
      },
    });
    expect(sandbox?.runConfiguration).toBeUndefined();
  });
});
