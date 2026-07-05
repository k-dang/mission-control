"use node";

import type { Sandbox } from "@vercel/sandbox";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createGitHubPullRequest, parseGithubRepoUrl } from "./github";
import { SANDBOX_REPO_PATH } from "./sandboxHelpers";

const DEFAULT_PR_BASE_BRANCH = "main";
const PR_METADATA_MODEL = "openai/gpt-5-mini";
const MAX_PR_DIFF_PROMPT_CHARS = 12_000;

const pullRequestMetadataSchema = z.object({
  body: z.string().trim().min(1),
  title: z.string().trim().min(1),
});

function buildFallbackPullRequestMetadata(
  title: string,
  description?: string,
) {
  const trimmedTitle = title.trim();
  const trimmedDescription = description?.trim();

  return {
    body: trimmedDescription || `Automated PR for todo: ${trimmedTitle}`,
    title: trimmedTitle,
  };
}

function normalizePullRequestMetadata(
  structured: unknown,
) {
  const metadata = pullRequestMetadataSchema.safeParse(structured);
  return metadata.success ? metadata.data : null;
}

type CreatePullRequestParams = {
  title: string;
  description?: string;
  repoUrl?: string;
  baseBranch?: string;
};

export async function createPullRequest(
  sandbox: Sandbox,
  params: CreatePullRequestParams,
) {
  const githubToken = process.env.GITHUB_TOKEN?.trim();
  if (!githubToken) {
    throw new Error("GITHUB_TOKEN is required to push commits and create PRs");
  }

  const stagedContextResult = await collectStagedPullRequestContext(
    sandbox,
    params,
  );
  if (stagedContextResult.kind === "noChanges") {
    return stagedContextResult;
  }

  const context = stagedContextResult.context;
  const metadata = await resolvePullRequestMetadataForContext(
    context,
    sandbox.sandboxId,
  );

  return publishPullRequest(
    sandbox,
    context,
    metadata.title,
    metadata.body,
    githubToken,
  );
}

async function collectStagedPullRequestContext(
  sandbox: Sandbox,
  params: CreatePullRequestParams,
) {
  const title = params.title.trim();
  if (!title) {
    throw new Error("PR creation requires a non-empty todo title");
  }

  const trimmedRepoUrl = params.repoUrl?.trim();
  const parsedRepo = trimmedRepoUrl ? parseGithubRepoUrl(trimmedRepoUrl) : null;
  if (!parsedRepo) {
    throw new Error(
      `Invalid GitHub repository URL: ${trimmedRepoUrl ?? "missing"}`,
    );
  }

  const statusOutput = await runGitCommand(sandbox, [
    "status",
    "--short",
    "--untracked-files=all",
  ]);
  if (!statusOutput.trim()) {
    return { kind: "noChanges" as const };
  }

  await runGitCommand(sandbox, ["add", "-A"]);
  const stagedFilesOutput = await runGitCommand(sandbox, [
    "diff",
    "--cached",
    "--name-only",
  ]);
  const stagedFiles = stagedFilesOutput.split("\n").flatMap((file) => {
    const trimmed = file.trim();
    return trimmed ? [trimmed] : [];
  });
  if (stagedFiles.length === 0) {
    return { kind: "noChanges" as const };
  }

  const [diffStat, diffPatch] = await Promise.all([
    runGitCommand(sandbox, ["diff", "--cached", "--stat"]),
    runGitCommand(sandbox, ["diff", "--cached", "--unified=1"]),
  ]);

  return {
    kind: "ready" as const,
    context: {
      title,
      description: params.description,
      repo: {
        owner: parsedRepo.owner,
        repo: parsedRepo.repo,
        baseBranch: params.baseBranch ?? DEFAULT_PR_BASE_BRANCH,
      },
      staged: {
        diffPatch,
        diffStat,
      },
    },
  };
}

type StagedPullRequestContext = Extract<
  Awaited<ReturnType<typeof collectStagedPullRequestContext>>,
  { kind: "ready" }
>["context"];

export async function generatePullRequestMetadataFromDiff(
  context: StagedPullRequestContext,
) {
  if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
    throw new Error(
      "AI_GATEWAY_API_KEY is required for PR metadata generation",
    );
  }

  const result = await generateText({
    model: PR_METADATA_MODEL,
    output: Output.object({
      name: "pull_request_metadata",
      description: "Pull request title and body for the staged diff.",
      schema: pullRequestMetadataSchema,
    }),
    prompt: buildPullRequestMetadataPrompt(context),
  });

  const metadata = normalizePullRequestMetadata(result.output);
  if (!metadata) {
    throw new Error(
      "AI SDK structured PR metadata response did not include a non-empty title and body",
    );
  }

  return metadata;
}

async function resolvePullRequestMetadataForContext(
  context: StagedPullRequestContext,
  sandboxId: string,
) {
  try {
    return await generatePullRequestMetadataFromDiff(context);
  } catch (error) {
    console.warn("Falling back to todo-based PR metadata", {
      error: error instanceof Error ? error.message : String(error),
      sandboxId,
    });
    return buildFallbackPullRequestMetadata(context.title, context.description);
  }
}

async function publishPullRequest(
  sandbox: Sandbox,
  context: StagedPullRequestContext,
  title: string,
  description: string,
  githubToken: string,
) {
  const branchName = buildBranchName(title);
  await runGitCommand(sandbox, ["checkout", "-b", branchName]);
  await runGitCommand(sandbox, ["commit", "-m", title]);

  const authenticatedRemote =
    `https://x-access-token:${githubToken}@github.com/` +
    `${context.repo.owner}/${context.repo.repo}.git`;
  await runGitCommand(sandbox, [
    "remote",
    "set-url",
    "origin",
    authenticatedRemote,
  ]);
  await runGitCommand(sandbox, ["push", "-u", "origin", branchName]);

  const commitSha = (
    await runGitCommand(sandbox, ["rev-parse", "HEAD"])
  ).trim();
  const pullRequest = await createGitHubPullRequest({
    baseBranch: context.repo.baseBranch,
    body: description,
    branchName,
    githubToken,
    owner: context.repo.owner,
    repo: context.repo.repo,
    title,
  });

  return {
    kind: "created" as const,
    branchName,
    commitSha,
    prNumber: pullRequest.number,
    prUrl: pullRequest.url,
  };
}

function buildPullRequestMetadataPrompt(context: StagedPullRequestContext) {
  const lines = [
    "Generate pull request metadata for the actual staged git changes below.",
    "Base the result on the staged diff, not just the original task text.",
    "",
    "Requirements:",
    "- Return a concise, imperative PR title.",
    "- Return a markdown PR body that starts with `## Summary` and contains 1-3 bullets.",
    "- Do not mention tests or validation unless they are explicitly shown in the diff/context below.",
    "",
    `Original task title: ${context.title}`,
  ];

  const trimmedDescription = context.description?.trim();
  if (trimmedDescription) {
    lines.push(`Original task description: ${trimmedDescription}`);
  }

  const trimmedDiffPatch = context.staged.diffPatch.trim();
  const diffPatchForPrompt =
    trimmedDiffPatch.length > MAX_PR_DIFF_PROMPT_CHARS
      ? `${trimmedDiffPatch.slice(0, MAX_PR_DIFF_PROMPT_CHARS)}\n\n[truncated ${trimmedDiffPatch.length - MAX_PR_DIFF_PROMPT_CHARS} characters]`
      : trimmedDiffPatch || "(empty)";

  lines.push(
    "",
    "Staged diff stat:",
    context.staged.diffStat || "(empty)",
    "",
    "Staged diff patch:",
    diffPatchForPrompt,
  );

  return lines.join("\n");
}

function buildBranchName(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return `mission-control/${slug || "todo"}-${Date.now()}`;
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
