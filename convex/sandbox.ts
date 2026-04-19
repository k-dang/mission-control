"use node";

import { Sandbox } from "@vercel/sandbox";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import {
  configureGitIdentity,
  getSandbox,
  requireSandboxAccessConfig,
} from "./lib/sandboxHelpers";

const SANDBOX_GIT_USER_NAME = "k-dang";
const SANDBOX_GIT_USER_EMAIL = "k-dang@users.noreply.github.com";

export const shutdownSandboxForTodo = internalAction({
  args: {
    todoId: v.id("todos"),
    sandboxId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const sandbox = await getSandbox(args.sandboxId);
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
      internal.todoSandboxes.getSandboxByTodoId,
      { todoId: args.todoId },
    );
    if (existingSandbox) {
      console.info("Sandbox already exists for todo, skipping creation", {
        todoId: args.todoId,
        sandboxId: existingSandbox.sandboxId,
      });
      return null;
    }

    const { projectId, teamId, token } = requireSandboxAccessConfig();
    const sandbox = await Sandbox.create({
      source: { type: "git", url: args.githubUrl },
      ports: [4096],
      runtime: "node24",
      timeout: 10 * 60 * 1000,
      env: {
        GITHUB_TOKEN: process.env.GITHUB_TOKEN!,
      },
      teamId,
      projectId,
      token,
    });

    try {
      await configureGitIdentity(
        sandbox,
        SANDBOX_GIT_USER_NAME,
        SANDBOX_GIT_USER_EMAIL,
      );
    } catch (error) {
      await sandbox.stop();
      throw error;
    }

    await ctx.runMutation(internal.todoSandboxes.saveSandboxResult, {
      todoId: args.todoId,
      sandboxId: sandbox.sandboxId,
    });

    await ctx.scheduler.runAfter(0, internal.opencode.runTodo, {
      todoId: args.todoId,
    });

    return null;
  },
});
