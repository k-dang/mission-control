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
  stopSandboxSafely,
} from "../lib/sandboxHelpers";

const STOP_AFTER_SANDBOX_CREATE_ENV = "STOP_AFTER_SANDBOX_CREATE";

export const spawnSandboxForTodo = internalAction({
  args: {
    todoId: v.id("todos"),
    attemptId: v.id("todoAttempts"),
    githubUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [todo, attempt] = await Promise.all([
      ctx.runQuery(internal.todos.getById, { todoId: args.todoId }),
      ctx.runQuery(internal.todoAttempts.getById, { attemptId: args.attemptId }),
    ]);
    if (!todo || !attempt?.isActive || attempt.todoId !== args.todoId) return null;
    if (attempt.sandboxId) {
      await ctx.scheduler.runAfter(0, internal.integrations.opencode.runTodo, {
        todoId: args.todoId,
        attemptId: args.attemptId,
      });
      return null;
    }

    let sandbox: Sandbox | undefined;
    try {
      const { projectId, teamId, token } = requireSandboxAccessConfig();
      const githubToken = process.env.GITHUB_TOKEN;
      if (!githubToken) {
        throw new Error("GITHUB_TOKEN is not set; sandbox git clone will 403 on private repos");
      }
      try {
        sandbox = await Sandbox.create({
          source: { type: "git", url: args.githubUrl },
          ports: [OPENCODE_PORT],
          runtime: "node24",
          timeout: 10 * 60 * 1000,
          env: { GITHUB_TOKEN: githubToken },
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

      await configureGitIdentity(sandbox, SANDBOX_GIT_USER_NAME, SANDBOX_GIT_USER_EMAIL);
      const recorded: boolean = await ctx.runMutation(internal.todoRuns.recordSandboxReady, {
        attemptId: args.attemptId,
        sandboxId: sandbox.sandboxId,
      });
      if (!recorded) {
        await stopSandboxSafely({
          todoId: args.todoId,
          attemptId: args.attemptId,
          sandboxId: sandbox.sandboxId,
          sandbox,
        });
        return null;
      }

      if (process.env[STOP_AFTER_SANDBOX_CREATE_ENV] === "true") {
        await sandbox.stop();
        return null;
      }
      await ctx.scheduler.runAfter(0, internal.integrations.opencode.runTodo, {
        todoId: args.todoId,
        attemptId: args.attemptId,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      if (sandbox) {
        await stopSandboxSafely({
          todoId: args.todoId,
          attemptId: args.attemptId,
          sandboxId: sandbox.sandboxId,
          sandbox,
        });
      }
      await ctx.runMutation(internal.todoRuns.failOrchestration, {
        attemptId: args.attemptId,
        reason,
      });
      throw error;
    }
    return null;
  },
});

export const stopSandboxForAttempt = internalAction({
  args: {
    todoId: v.id("todos"),
    attemptId: v.id("todoAttempts"),
    sandboxId: v.string(),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    await stopSandboxSafely(args);
    return null;
  },
});
