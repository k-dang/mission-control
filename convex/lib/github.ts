import { z } from "zod";

const githubPullRequestSchema = z.object({
  html_url: z.string(),
  number: z.number(),
});

const githubErrorSchema = z.object({
  message: z.string(),
});

export function parseGithubRepoUrl(githubUrl: string) {
  const match = githubUrl.match(
    /github\.com[:/]+([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/?#]|$)/i,
  );
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

export async function createGitHubPullRequest(params: {
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

  const payload: unknown = await response.json();
  if (!response.ok) {
    const errorPayload = githubErrorSchema.safeParse(payload);
    const errorMessage = errorPayload.success
      ? errorPayload.data.message
      : `GitHub PR creation failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  const pullRequestPayload = githubPullRequestSchema.safeParse(payload);
  if (!pullRequestPayload.success) {
    throw new Error("GitHub PR creation returned an unexpected response");
  }

  return {
    number: pullRequestPayload.data.number,
    url: pullRequestPayload.data.html_url,
  };
}
