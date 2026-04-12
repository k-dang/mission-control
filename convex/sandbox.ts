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
    const existingSandbox = await ctx.runQuery(
      internal.sandboxStorage.getSandboxByTodoId,
      { todoId: args.todoId },
    );
    if (existingSandbox) {
      console.info("Sandbox already exists for todo, skipping creation", {
        todoId: args.todoId,
        sandboxId: existingSandbox.sandboxId,
      });
      return null;
    }
    const teamId = process.env.VERCEL_TEAM_ID;
    const projectId = process.env.VERCEL_PROJECT_ID;
    const token = process.env.VERCEL_TOKEN;
    if (!teamId || !projectId || !token) {
      throw new Error("Missing required Vercel sandbox environment variables");
    }
    const githubToken = process.env.GITHUB_TOKEN;
    const sandbox = await Sandbox.create({
      source: { type: "git", url: args.githubUrl },
      ports: [4096],
      runtime: "node24",
      timeout: 10 * 60 * 1000,
      env: githubToken ? { GITHUB_TOKEN: githubToken } : undefined,
      teamId,
      projectId,
      token,
    });

    await ctx.runMutation(internal.sandboxStorage.saveSandboxResult, {
      todoId: args.todoId,
      sandboxId: sandbox.sandboxId,
    });

    await ctx.scheduler.runAfter(0, internal.opencode.runOpencodeForTodo, {
      todoId: args.todoId,
    });

    return null;
  },
});
