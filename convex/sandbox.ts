"use node";

import { Sandbox } from "@vercel/sandbox";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const SANDBOX_REPO_PATH = "/vercel/sandbox";
const DEFAULT_SANDBOX_GIT_USER_NAME = "OpenCode Bot";
const DEFAULT_SANDBOX_GIT_USER_EMAIL =
  "opencode-bot@users.noreply.github.com";

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
    const gitUserName = DEFAULT_SANDBOX_GIT_USER_NAME;
    const gitUserEmail = DEFAULT_SANDBOX_GIT_USER_EMAIL;
    const sandbox = await Sandbox.create({
      source: { type: "git", url: args.githubUrl },
      ports: [4096],
      runtime: "node24",
      timeout: 10 * 60 * 1000,
      env: {
        ...(githubToken ? { GITHUB_TOKEN: githubToken } : {}),
        GIT_AUTHOR_NAME: gitUserName,
        GIT_AUTHOR_EMAIL: gitUserEmail,
        GIT_COMMITTER_NAME: gitUserName,
        GIT_COMMITTER_EMAIL: gitUserEmail,
      },
      teamId,
      projectId,
      token,
    });

    try {
      await configureSandboxGitIdentity(sandbox, gitUserName, gitUserEmail);
    } catch (error) {
      await sandbox.stop().catch((stopError) => {
        console.warn("Failed to stop sandbox after git config failure", {
          todoId: args.todoId,
          error:
            stopError instanceof Error ? stopError.message : String(stopError),
        });
      });
      throw error;
    }

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

async function configureSandboxGitIdentity(
  sandbox: Sandbox,
  gitUserName: string,
  gitUserEmail: string,
) {
  const nameResult = await sandbox.runCommand({
    cmd: "git",
    args: ["config", "user.name", gitUserName],
    cwd: SANDBOX_REPO_PATH,
  });
  if (nameResult.exitCode !== 0) {
    const output = (await nameResult.output()).toString().trim();
    throw new Error(
      `Failed to configure sandbox git user.name (exit ${nameResult.exitCode})${output ? `: ${output.slice(0, 2000)}` : ""}`,
    );
  }

  const emailResult = await sandbox.runCommand({
    cmd: "git",
    args: ["config", "user.email", gitUserEmail],
    cwd: SANDBOX_REPO_PATH,
  });
  if (emailResult.exitCode !== 0) {
    const output = (await emailResult.output()).toString().trim();
    throw new Error(
      `Failed to configure sandbox git user.email (exit ${emailResult.exitCode})${output ? `: ${output.slice(0, 2000)}` : ""}`,
    );
  }
}
