"use node";

import { Sandbox } from "@vercel/sandbox";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { OPENCODE_PORT } from "./lib/opencodeHelpers";
import {
  configureGitIdentity,
  requireSandboxAccessConfig,
  SANDBOX_GIT_USER_EMAIL,
  SANDBOX_GIT_USER_NAME,
} from "./lib/sandboxHelpers";

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
      ports: [OPENCODE_PORT],
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
