
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

  if (
    typeof payload.html_url !== "string" ||
    typeof payload.number !== "number"
  ) {
    throw new Error("GitHub PR creation returned an unexpected response");
  }

  return {
    number: payload.number,
    url: payload.html_url,
  };
}
