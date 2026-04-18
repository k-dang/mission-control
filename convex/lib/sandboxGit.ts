"use node";

import { Sandbox } from "@vercel/sandbox";
import { parseGithubRepoUrl } from "./github";

const SANDBOX_REPO_PATH = "/vercel/sandbox";
const DEFAULT_PR_BASE_BRANCH = "main";

export type SandboxPrCreationResult =
  | {
      kind: "noChanges";
    }
  | {
      kind: "created";
      branchName: string;
      commitSha: string;
      prNumber: number;
      prUrl: string;
    };

type CreateSandboxPrParams = {
  baseBranch?: string;
  description?: string;
  githubToken: string | undefined;
  repoUrl: string | undefined;
  sandboxId: string;
  title: string;
};

export function buildPullRequestBody(title: string, description?: string) {
  const trimmedDescription = description?.trim();
  if (trimmedDescription) {
    return trimmedDescription;
  }

  return `Automated PR for todo: ${title.trim()}`;
}

export async function createPullRequestForSandbox(params: CreateSandboxPrParams) {
  const {
    baseBranch = DEFAULT_PR_BASE_BRANCH,
    description,
    githubToken,
    repoUrl,
    sandboxId,
    title,
  } = params;
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new Error("PR creation requires a non-empty todo title");
  }

  const trimmedRepoUrl = repoUrl?.trim();
  if (!githubToken?.trim()) {
    throw new Error("GITHUB_TOKEN is required to push commits and create PRs");
  }

  const parsedRepo = trimmedRepoUrl ? parseGithubRepoUrl(trimmedRepoUrl) : null;
  if (!parsedRepo) {
    throw new Error(`Invalid GitHub repository URL: ${trimmedRepoUrl ?? "missing"}`);
  }

  const sandbox = await Sandbox.get({
    sandboxId,
    token: process.env.VERCEL_TOKEN,
    teamId: process.env.VERCEL_TEAM_ID,
    projectId: process.env.VERCEL_PROJECT_ID,
  });

  const statusOutput = await runGitCommand(sandbox, [
    "status",
    "--short",
    "--untracked-files=all",
  ]);
  if (!statusOutput.trim()) {
    return { kind: "noChanges" } as const;
  }

  await runGitCommand(sandbox, ["add", "-A"]);
  const stagedFiles = await runGitCommand(sandbox, ["diff", "--cached", "--name-only"]);
  if (!stagedFiles.trim()) {
    return { kind: "noChanges" } as const;
  }

  const branchName = buildBranchName(trimmedTitle);
  await runGitCommand(sandbox, ["checkout", "-b", branchName]);
  await runGitCommand(sandbox, ["commit", "-m", trimmedTitle]);

  const authenticatedRemote = `https://x-access-token:${githubToken.trim()}@github.com/${parsedRepo.owner}/${parsedRepo.repo}.git`;
  await runGitCommand(sandbox, ["remote", "set-url", "origin", authenticatedRemote]);
  await runGitCommand(sandbox, ["push", "-u", "origin", branchName]);

  const commitSha = (await runGitCommand(sandbox, ["rev-parse", "HEAD"])).trim();
  const pullRequest = await createGitHubPullRequest({
    baseBranch,
    body: buildPullRequestBody(trimmedTitle, description),
    branchName,
    githubToken,
    owner: parsedRepo.owner,
    repo: parsedRepo.repo,
    title: trimmedTitle,
  });

  return {
    kind: "created",
    branchName,
    commitSha,
    prNumber: pullRequest.number,
    prUrl: pullRequest.url,
  } as const;
}

function buildBranchName(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return `opencode/${slug || "todo"}-${Date.now()}`;
}

async function createGitHubPullRequest(params: {
  baseBranch: string;
  body: string;
  branchName: string;
  githubToken: string;
  owner: string;
  repo: string;
  title: string;
}) {
  const response = await fetch(
    `https://api.github.com/repos/${params.owner}/${params.repo}/pulls`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${params.githubToken.trim()}`,
        "Content-Type": "application/json",
        "User-Agent": "convex-todo-app",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        title: params.title,
        body: params.body,
        head: params.branchName,
        base: params.baseBranch,
      }),
    },
  );

  const payload = (await response.json()) as {
    html_url?: string;
    message?: string;
    number?: number;
  };
  if (!response.ok) {
    const message =
      typeof payload.message === "string"
        ? payload.message
        : `GitHub PR creation failed with status ${response.status}`;
    throw new Error(message);
  }

  if (typeof payload.html_url !== "string" || typeof payload.number !== "number") {
    throw new Error("GitHub PR creation returned an unexpected response");
  }

  return {
    number: payload.number,
    url: payload.html_url,
  };
}

async function runGitCommand(sandbox: Sandbox, args: string[]) {
  const result = await sandbox.runCommand({
    cmd: "git",
    args,
    cwd: SANDBOX_REPO_PATH,
  });
  const output = (await result.output()).toString().trim();
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed (exit ${result.exitCode})${output ? `: ${output.slice(0, 2000)}` : ""}`,
    );
  }
  return output;
}
