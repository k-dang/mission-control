export function parseGithubRepoUrl(githubUrl: string) {
  const match = githubUrl.match(
    /github\.com[:/]+([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/?#]|$)/i,
  );
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

function getObjectField(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || !(key in value)) {
    return undefined;
  }

  return Reflect.get(value, key);
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

  const payload = await response.json();
  const message = getObjectField(payload, "message");
  const htmlUrl = getObjectField(payload, "html_url");
  const number = getObjectField(payload, "number");
  if (!response.ok) {
    const errorMessage =
      typeof message === "string"
        ? message
        : `GitHub PR creation failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  if (typeof htmlUrl !== "string" || typeof number !== "number") {
    throw new Error("GitHub PR creation returned an unexpected response");
  }

  return {
    number,
    url: htmlUrl,
  };
}
