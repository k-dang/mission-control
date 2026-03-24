"use node";

import { Sandbox } from "@vercel/sandbox";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

export const shutdownSandboxForTodo = internalAction({
  args: {
    todoId: v.id("todos"),
    sandboxId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const sandbox = await Sandbox.get({
        sandboxId: args.sandboxId,
        token: process.env.VERCEL_TOKEN,
        teamId: process.env.VERCEL_TEAM_ID,
        projectId: process.env.VERCEL_PROJECT_ID,
      });
      await sandbox.stop();
      console.info("Sandbox stopped for todo", {
        todoId: args.todoId,
        sandboxId: args.sandboxId,
      });
    } catch (error) {
      console.warn("Failed to stop sandbox", {
        todoId: args.todoId,
        sandboxId: args.sandboxId,
        error,
      });
    }

    await ctx.runMutation(internal.sandboxStorage.clearSandboxResult, {
      todoId: args.todoId,
    });

    return null;
  },
});

export const spawnSandboxForTodo = internalAction({
  args: {
    todoId: v.id("todos"),
    githubUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const todo = await ctx.runQuery(internal.todos.getById, {
      todoId: args.todoId,
    });
    if (!todo) {
      console.warn("Todo not found, skipping sandbox creation", {
        todoId: args.todoId,
      });
      return null;
    }
    if (todo.sandboxId) {
      console.info("Sandbox already exists for todo, skipping creation", {
        todoId: args.todoId,
        sandboxId: todo.sandboxId,
      });
      return null;
    }
    const {
      VERCEL_TEAM_ID,
      VERCEL_PROJECT_ID,
      VERCEL_TOKEN,
      GITHUB_TOKEN,
    } = process.env;
    if (!VERCEL_TEAM_ID || !VERCEL_PROJECT_ID || !VERCEL_TOKEN) {
      throw new Error("Missing required Vercel sandbox environment variables");
    }
    const sandboxEnv: Record<string, string> = {};
    if (GITHUB_TOKEN) sandboxEnv.GITHUB_TOKEN = GITHUB_TOKEN;
    const sandbox = await Sandbox.create({
      source: { type: "git", url: args.githubUrl },
      ports: [3000, 4096],
      runtime: "node24",
      timeout: 10 * 60 * 1000,
      env: Object.keys(sandboxEnv).length > 0 ? sandboxEnv : undefined,
      teamId: VERCEL_TEAM_ID,
      projectId: VERCEL_PROJECT_ID,
      token: VERCEL_TOKEN,
    });

    const sandboxUrl = sandbox.domain(3000);

    await ctx.runMutation(internal.sandboxStorage.saveSandboxResult, {
      todoId: args.todoId,
      sandboxId: sandbox.sandboxId,
      sandboxUrl,
    });

    await ctx.scheduler.runAfter(0, internal.opencode.runOpencodeForTodo, {
      todoId: args.todoId,
    });

    return null;
  },
});
