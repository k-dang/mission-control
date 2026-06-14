"use node";

import { APIError, Sandbox } from "@vercel/sandbox";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { OPENCODE_PORT } from "../lib/opencodeConfig";
import {
  configureGitIdentity,
  requireSandboxAccessConfig,
  SANDBOX_GIT_USER_EMAIL,
  SANDBOX_GIT_USER_NAME,
} from "../lib/sandboxHelpers";
import { runConfigurationValidator } from "../lib/todoValidators";

const STOP_AFTER_SANDBOX_CREATE_ENV = "STOP_AFTER_SANDBOX_CREATE";

export const spawnSandboxForTodo = internalAction({
  args: {
    todoId: v.id("todos"),
    githubUrl: v.string(),
    runConfiguration: runConfigurationValidator,
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
    if (existingSandbox?.sandboxId) {
      console.info("Sandbox already exists for todo, skipping creation", {
        todoId: args.todoId,
        sandboxId: existingSandbox.sandboxId,
      });
      return null;
    }

    const { projectId, teamId, token } = requireSandboxAccessConfig();
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      throw new Error(
        "GITHUB_TOKEN is not set; sandbox git clone will 403 on private repos",
      );
    }
    let sandbox: Sandbox;
    try {
      sandbox = await Sandbox.create({
        source: { type: "git", url: args.githubUrl },
        ports: [OPENCODE_PORT],
        runtime: "node24",
        timeout: 10 * 60 * 1000,
        env: {
          GITHUB_TOKEN: githubToken,
        },
        teamId,
        projectId,
        token,
      });
    } catch (error) {
      if (error instanceof APIError) {
        throw new Error(
          `Sandbox.create failed (${error.response.status}): ${error.text || JSON.stringify(error.json)}`,
        );
      }
      throw error;
    }

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

    if (process.env[STOP_AFTER_SANDBOX_CREATE_ENV] === "true") {
      console.info("Stopping after sandbox creation by environment flag", {
        todoId: args.todoId,
        sandboxId: sandbox.sandboxId,
        env: STOP_AFTER_SANDBOX_CREATE_ENV,
      });
      await sandbox.stop();
      return null;
    }

    await ctx.runMutation(internal.todoRuns.recordSandboxReady, {
      todoId: args.todoId,
      sandboxId: sandbox.sandboxId,
      runConfiguration: args.runConfiguration,
    });

    await ctx.scheduler.runAfter(0, internal.integrations.opencode.runTodo, {
      todoId: args.todoId,
    });

    return null;
  },
});
