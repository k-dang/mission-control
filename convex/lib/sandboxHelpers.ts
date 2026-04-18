"use node";

import { createOpencodeClient, type OutputFormat } from "@opencode-ai/sdk/v2/client";
import { Sandbox } from "@vercel/sandbox";
import { parseGithubRepoUrl } from "./github";
import { getOpencodeErrorMessage } from "./opencodeHelpers";

export const SANDBOX_REPO_PATH = "/vercel/sandbox";

const DEFAULT_PR_BASE_BRANCH = "main";
const MAX_PR_DIFF_PROMPT_CHARS = 12_000;

const STRUCTURED_PR_METADATA_FORMAT = {
  type: "json_schema",
  retryCount: 2,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: {
        type: "string",
        description:
          "A concise pull request title describing the actual completed change.",
      },
      body: {
        type: "string",
        description:
          "A concise markdown pull request body that starts with '## Summary' and uses 1-3 bullets.",
      },
    },
    required: ["title", "body"],
  },
} satisfies OutputFormat;

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

export type PullRequestMetadata = {
  body: string;
  title: string;
};

type PrSummaryModel = {
  modelID: string;
  providerID: string;
};

type GenerateSandboxPrMetadataParams = {
  description?: string;
  opencodeSessionId?: string;
  opencodeUrl?: string;
  prSummaryModel?: PrSummaryModel;
  sandboxId: string;
  title: string;
};

type CreateSandboxPrParams = {
  baseBranch?: string;
  githubToken: string | undefined;
  prMetadata: PullRequestMetadata;
  repoUrl: string | undefined;
  sandboxId: string;
};

type SandboxAccessConfig = {
  projectId: string;
  teamId: string;
  token: string;
};

export function buildPullRequestBody(title: string, description?: string) {
  const trimmedDescription = description?.trim();
  if (trimmedDescription) {
    return trimmedDescription;
  }

  return `Automated PR for todo: ${title.trim()}`;
}

export function buildFallbackPullRequestMetadata(
  title: string,
  description?: string,
): PullRequestMetadata {
  return {
    body: buildPullRequestBody(title, description),
    title: title.trim(),
  };
}

export function requireSandboxAccessConfig(): SandboxAccessConfig {
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const token = process.env.VERCEL_TOKEN;
  if (!teamId || !projectId || !token) {
    throw new Error("Missing required Vercel sandbox environment variables");
  }
  return { projectId, teamId, token };
}

export async function getSandbox(sandboxId: string) {
  return Sandbox.get({
    sandboxId,
    ...requireSandboxAccessConfig(),
  });
}

export async function configureSandboxGitIdentity(
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

export async function generatePullRequestMetadataForSandbox(
  params: GenerateSandboxPrMetadataParams,
) {
  const {
    description,
    opencodeSessionId,
    opencodeUrl,
    prSummaryModel,
    sandboxId,
    title,
  } = params;
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new Error("PR metadata generation requires a non-empty todo title");
  }

  const sandbox = await getSandbox(sandboxId);

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

  const stagedDiffStat = await runGitCommand(sandbox, ["diff", "--cached", "--stat"]);
  const stagedDiffPatch = await runGitCommand(sandbox, ["diff", "--cached", "--unified=1"]);
  let generatedMetadata: PullRequestMetadata | null = null;
  try {
    generatedMetadata = await generatePullRequestMetadata({
      description,
      diffPatch: stagedDiffPatch,
      diffStat: stagedDiffStat,
      opencodeSessionId,
      opencodeUrl,
      prSummaryModel,
      title: trimmedTitle,
    });
  } catch (error) {
    console.warn("Falling back to todo-based PR metadata", {
      error: error instanceof Error ? error.message : String(error),
      sandboxId,
    });
  }

  return {
    kind: "ready",
    prMetadata:
      generatedMetadata ??
      buildFallbackPullRequestMetadata(trimmedTitle, description),
  } as const;
}

export async function createPullRequestForSandbox(params: CreateSandboxPrParams) {
  const { baseBranch = DEFAULT_PR_BASE_BRANCH, githubToken, prMetadata, repoUrl, sandboxId } =
    params;
  const normalizedMetadata = normalizePullRequestMetadata(prMetadata);
  if (!normalizedMetadata) {
    throw new Error("PR creation requires non-empty pull request title and body");
  }

  const trimmedRepoUrl = repoUrl?.trim();
  if (!githubToken?.trim()) {
    throw new Error("GITHUB_TOKEN is required to push commits and create PRs");
  }

  const parsedRepo = trimmedRepoUrl ? parseGithubRepoUrl(trimmedRepoUrl) : null;
  if (!parsedRepo) {
    throw new Error(`Invalid GitHub repository URL: ${trimmedRepoUrl ?? "missing"}`);
  }

  const sandbox = await getSandbox(sandboxId);

  await runGitCommand(sandbox, ["add", "-A"]);
  const stagedFiles = await runGitCommand(sandbox, ["diff", "--cached", "--name-only"]);
  if (!stagedFiles.trim()) {
    return { kind: "noChanges" } as const;
  }

  const branchName = buildBranchName(normalizedMetadata.title);
  await runGitCommand(sandbox, ["checkout", "-b", branchName]);
  await runGitCommand(sandbox, ["commit", "-m", normalizedMetadata.title]);

  const authenticatedRemote = `https://x-access-token:${githubToken.trim()}@github.com/${parsedRepo.owner}/${parsedRepo.repo}.git`;
  await runGitCommand(sandbox, ["remote", "set-url", "origin", authenticatedRemote]);
  await runGitCommand(sandbox, ["push", "-u", "origin", branchName]);

  const commitSha = (await runGitCommand(sandbox, ["rev-parse", "HEAD"])).trim();
  const pullRequest = await createGitHubPullRequest({
    baseBranch,
    body: normalizedMetadata.body,
    branchName,
    githubToken,
    owner: parsedRepo.owner,
    repo: parsedRepo.repo,
    title: normalizedMetadata.title,
  });

  return {
    kind: "created",
    branchName,
    commitSha,
    prNumber: pullRequest.number,
    prUrl: pullRequest.url,
  } as const;
}

export function normalizePullRequestMetadata(
  structured: unknown,
): PullRequestMetadata | null {
  if (!structured || typeof structured !== "object") {
    return null;
  }

  const record = structured as Record<string, unknown>;
  const title =
    typeof record.title === "string" ? record.title.trim() : "";
  const body = typeof record.body === "string" ? record.body.trim() : "";
  if (!title || !body) {
    return null;
  }

  return { body, title };
}

function buildBranchName(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return `mission-control/${slug || "todo"}-${Date.now()}`;
}

function buildPullRequestMetadataPrompt(params: {
  description?: string;
  diffPatch: string;
  diffStat: string;
  title: string;
}) {
  const lines = [
    "Generate pull request metadata for the actual staged git changes below.",
    "Base the result on the staged diff, not just the original task text.",
    "",
    "Requirements:",
    "- Return a concise, imperative PR title.",
    "- Return a markdown PR body that starts with `## Summary` and contains 1-3 bullets.",
    "- Do not mention tests or validation unless they are explicitly shown in the diff/context below.",
    "",
    `Original task title: ${params.title}`,
  ];

  const trimmedDescription = params.description?.trim();
  if (trimmedDescription) {
    lines.push(`Original task description: ${trimmedDescription}`);
  }

  lines.push(
    "",
    "Staged diff stat:",
    params.diffStat || "(empty)",
    "",
    "Staged diff patch:",
    truncateForPrompt(params.diffPatch, MAX_PR_DIFF_PROMPT_CHARS),
  );

  return lines.join("\n");
}

async function generatePullRequestMetadata(params: {
  description?: string;
  diffPatch: string;
  diffStat: string;
  opencodeSessionId?: string;
  opencodeUrl?: string;
  prSummaryModel?: PrSummaryModel;
  title: string;
}): Promise<PullRequestMetadata | null> {
  if (
    !params.opencodeUrl?.trim() ||
    !params.opencodeSessionId?.trim() ||
    !params.prSummaryModel
  ) {
    return null;
  }

  const client = createOpencodeClient({ baseUrl: params.opencodeUrl.trim() });
  const response = await client.session.prompt({
    format: STRUCTURED_PR_METADATA_FORMAT,
    model: params.prSummaryModel,
    parts: [
      {
        type: "text",
        text: buildPullRequestMetadataPrompt(params),
      },
    ],
    sessionID: params.opencodeSessionId.trim(),
  });

  const promptError = response.error ?? response.data?.info.error;
  if (promptError) {
    throw new Error(getOpencodeErrorMessage(promptError));
  }

  const metadata = normalizePullRequestMetadata(response.data?.info.structured);
  if (!metadata) {
    throw new Error(
      "OpenCode structured PR metadata response did not include a non-empty title and body",
    );
  }

  return metadata;
}

function truncateForPrompt(text: string, maxChars: number) {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return trimmed || "(empty)";
  }

  return `${trimmed.slice(0, maxChars)}\n\n[truncated ${trimmed.length - maxChars} characters]`;
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
