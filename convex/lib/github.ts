export type ParsedGithubRepo = {
  owner: string;
  repo: string;
};

export function parseGithubRepoUrl(githubUrl: string): ParsedGithubRepo | null {
  const match = githubUrl.match(
    /github\.com[:/]+([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/?#]|$)/i,
  );
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}
