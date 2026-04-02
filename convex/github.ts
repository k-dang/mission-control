"use node";

import { Sandbox } from "@vercel/sandbox";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";

const GIT_USER_EMAIL = "ai-agent@example.com";
const GIT_USER_NAME = "AI Coding Agent";
const DEFAULT_BRANCH_PREFIX = "feature/ai-changes";
const DEFAULT_BASE_BRANCH = "main";
const GIT_ADD_ARGS = [
  "add",
  ".",
  ":!*.tar",
  ":!*.tar.gz",
  ":!*.tar.bz2",
  ":!*.tar.xz",
  ":!*.tgz",
  ":!*.tbz",
  ":!*.tbz2",
  ":!*.txz",
] as const;

export function buildBranchName(branch: string | null, timestamp = Date.now()) {
  return `${branch || DEFAULT_BRANCH_PREFIX}-${timestamp}`;
}

export function parseGitHubRepoUrl(repoUrl: string) {
  const parsedRepoUrl = new URL(repoUrl);
  const [owner, repoNameWithMaybeGit] = parsedRepoUrl.pathname
    .split("/")
    .filter(Boolean);
  const repo = repoNameWithMaybeGit?.replace(/\.git$/, "");

  if (parsedRepoUrl.hostname !== "github.com" || !owner || !repo) {
    throw new Error("Invalid GitHub repository URL");
  }

  return { owner, repo };
}

export function buildAuthenticatedRepoUrl(
  owner: string,
  repo: string,
  githubToken: string,
) {
  return `https://x-access-token:${encodeURIComponent(githubToken)}@github.com/${owner}/${repo}.git`;
}

export const createPR = async (
  sandbox: Sandbox,
  repoUrl: string,
  prDetails: { title: string; body: string; branch: string | null },
) => {
  const githubToken = process.env.GITHUB_TOKEN?.trim();
  if (!githubToken) {
    throw new Error("GITHUB_TOKEN environment variable is required");
  }

  const title = prDetails.title.trim();
  if (!title) {
    throw new Error("PR title is required");
  }

  const branchName = buildBranchName(prDetails.branch);
  const { owner, repo } = parseGitHubRepoUrl(repoUrl);
  const authenticatedRepoUrl = buildAuthenticatedRepoUrl(
    owner,
    repo,
    githubToken,
  );
  const originalOrigin = await sandbox.runCommand("git", [
    "remote",
    "get-url",
    "origin",
  ]);
  const originalOriginOutput = (await originalOrigin.output())
    .toString()
    .trim();

  if (originalOrigin.exitCode !== 0 || !originalOriginOutput) {
    throw new Error("Failed to read the sandbox git origin URL");
  }

  await sandbox.runCommand("git", ["config", "user.email", GIT_USER_EMAIL]);
  await sandbox.runCommand("git", ["config", "user.name", GIT_USER_NAME]);

  const status = await sandbox.runCommand("git", ["status", "--porcelain"]);
  const statusOutput = (await status.output()).toString().trim();
  if (status.exitCode !== 0) {
    throw new Error("Failed to inspect sandbox git status");
  }
  if (!statusOutput) {
    throw new Error("Sandbox has no changes to submit");
  }

  const baseBranchCommand = await sandbox.runCommand("git", [
    "symbolic-ref",
    "refs/remotes/origin/HEAD",
  ]);
  const baseBranchOutput = (await baseBranchCommand.output()).toString().trim();
  const baseBranch =
    baseBranchCommand.exitCode === 0
      ? (baseBranchOutput.split("/").pop() ?? DEFAULT_BASE_BRANCH)
      : DEFAULT_BASE_BRANCH;

  try {
    const setRemote = await sandbox.runCommand("git", [
      "remote",
      "set-url",
      "origin",
      authenticatedRepoUrl,
    ]);
    if (setRemote.exitCode !== 0) {
      throw new Error("Failed to configure the sandbox git remote");
    }

    const checkout = await sandbox.runCommand("git", [
      "checkout",
      "-b",
      branchName,
    ]);
    if (checkout.exitCode !== 0) {
      throw new Error(`Failed to create git branch ${branchName}`);
    }

    const add = await sandbox.runCommand("git", [...GIT_ADD_ARGS]);
    if (add.exitCode !== 0) {
      throw new Error("Failed to stage sandbox changes");
    }

    const diff = await sandbox.runCommand("git", [
      "diff",
      "--cached",
      "--name-only",
    ]);
    const diffOutput = (await diff.output()).toString().trim();
    if (diff.exitCode !== 0) {
      throw new Error("Failed to inspect staged sandbox changes");
    }
    if (!diffOutput) {
      throw new Error("Sandbox has no commit-ready changes to submit");
    }

    const commit = await sandbox.runCommand("git", ["commit", "-m", title]);
    if (commit.exitCode !== 0) {
      const commitOutput = (await commit.output()).toString().trim();
      throw new Error(
        commitOutput || "Failed to create a git commit from sandbox changes",
      );
    }

    const push = await sandbox.runCommand("git", [
      "push",
      "origin",
      branchName,
    ]);
    if (push.exitCode !== 0) {
      const pushOutput = (await push.output()).toString().trim();
      throw new Error(pushOutput || `Failed to push git branch ${branchName}`);
    }

    const prResponse = await sandbox.runCommand("curl", [
      "-s",
      "-X",
      "POST",
      "-H",
      `Authorization: token ${githubToken}`,
      "-H",
      "Accept: application/vnd.github.v3+json",
      "-H",
      "Content-Type: application/json",
      "-d",
      JSON.stringify({
        title,
        body: prDetails.body,
        head: branchName,
        base: baseBranch,
      }),
      `https://api.github.com/repos/${owner}/${repo}/pulls`,
    ]);

    const prOutput = (await prResponse.output()).toString().trim();
    let prResult: { html_url?: string; number?: number; message?: string };
    try {
      prResult = JSON.parse(prOutput);
    } catch {
      throw new Error(prOutput || "GitHub returned an invalid PR response");
    }

    if (!prResult.html_url) {
      throw new Error(prResult.message || "Failed to create PR");
    }

    return {
      branch: branchName,
      prNumber: prResult.number,
      prUrl: prResult.html_url,
    };
  } finally {
    await sandbox.runCommand("git", [
      "remote",
      "set-url",
      "origin",
      originalOriginOutput,
    ]);
  }
};

export const createPullRequestForTodo = action({
  args: {
    todoId: v.id("todos"),
  },
  returns: v.object({
    branch: v.string(),
    prNumber: v.optional(v.number()),
    prUrl: v.string(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "You must be signed in to create a pull request.",
      });
    }

    const todo = await ctx.runQuery(internal.todos.getById, {
      todoId: args.todoId,
    });

    if (!todo) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Todo not found",
      });
    }

    if (todo.prUrl) {
      throw new ConvexError({
        code: "PR_EXISTS",
        message: "This todo already has a pull request.",
      });
    }

    if (!todo.githubUrl?.trim()) {
      throw new ConvexError({
        code: "MISSING_GITHUB_URL",
        message: "This todo does not have a GitHub repository URL.",
      });
    }

    if (!todo.sandboxId?.trim()) {
      throw new ConvexError({
        code: "MISSING_SANDBOX",
        message: "This todo does not have a sandbox to submit.",
      });
    }

    const sandbox = await Sandbox.get({
      sandboxId: todo.sandboxId,
      token: process.env.VERCEL_TOKEN,
      teamId: process.env.VERCEL_TEAM_ID,
      projectId: process.env.VERCEL_PROJECT_ID,
    });

    const result = await createPR(sandbox, todo.githubUrl, {
      title: todo.title,
      body: todo.description?.trim()
        ? `${todo.description.trim()}\n\nGenerated from Mission Control sandbox.`
        : "Generated from Mission Control sandbox.",
      branch: todo._id,
    });

    await ctx.runMutation(internal.sandboxStorage.savePrUrl, {
      todoId: args.todoId,
      prUrl: result.prUrl,
    });

    await ctx.runAction(internal.sandbox.shutdownSandboxForTodo, {
      todoId: args.todoId,
      sandboxId: todo.sandboxId,
    });

    return result;
  },
});
