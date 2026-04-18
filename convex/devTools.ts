"use node";

import { Buffer } from "node:buffer";
import { v } from "convex/values";
import { action } from "./_generated/server";

const MISSION_CONTROL = { owner: "k-dang", repo: "mission-control" } as const;
const DEV_TOOLS_DISABLED_ERROR = "Not found.";

function areDevToolsEnabled() {
  return process.env.NODE_ENV !== "production";
}

function githubHeaders(token: string) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token.trim()}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "convex-todo-app",
  } as const;
}

async function readGithubError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      message?: string;
      errors?: Array<{ message?: string }>;
    };
    const detail = body.errors?.map((e) => e.message).filter(Boolean).join("; ");
    return [body.message, detail].filter(Boolean).join(" — ") || response.statusText;
  } catch {
    return response.statusText;
  }
}

async function getBranchHeadCommitSha(
  owner: string,
  repo: string,
  branch: string,
  headers: ReturnType<typeof githubHeaders>,
): Promise<string | null> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    { headers },
  );
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as { object?: { sha?: string } };
  return data.object?.sha ?? null;
}

export const checkGithubToken = action({
  args: {},
  returns: v.object({
    configured: v.boolean(),
    authenticated: v.boolean(),
    login: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
  }),
  handler: async () => {
    if (!areDevToolsEnabled()) {
      return {
        configured: false,
        authenticated: false,
        login: null,
        error: DEV_TOOLS_DISABLED_ERROR,
      };
    }

    const token = process.env.GITHUB_TOKEN;

    if (!token?.trim()) {
      return {
        configured: false,
        authenticated: false,
        login: null,
        error: "GITHUB_TOKEN is not set in Convex environment variables.",
      };
    }

    try {
      const response = await fetch("https://api.github.com/user", {
        headers: githubHeaders(token),
      });

      if (response.status === 200) {
        const body = (await response.json()) as { login?: string };
        return {
          configured: true,
          authenticated: true,
          login: body.login ?? null,
          error: null,
        };
      }

      if (response.status === 401) {
        return {
          configured: true,
          authenticated: false,
          login: null,
          error: "Token is set but invalid or expired (401 Unauthorized).",
        };
      }

      return {
        configured: true,
        authenticated: false,
        login: null,
        error: `GitHub API returned unexpected status ${response.status}.`,
      };
    } catch (err) {
      return {
        configured: true,
        authenticated: false,
        login: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

/** Creates a real PR on k-dang/mission-control to verify the token can push and open PRs. */
export const createMissionControlTestPullRequest = action({
  args: {},
  returns: v.object({
    ok: v.boolean(),
    pullRequestUrl: v.union(v.string(), v.null()),
    pullRequestNumber: v.union(v.number(), v.null()),
    branch: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
  }),
  handler: async () => {
    if (!areDevToolsEnabled()) {
      return {
        ok: false,
        pullRequestUrl: null,
        pullRequestNumber: null,
        branch: null,
        error: DEV_TOOLS_DISABLED_ERROR,
      };
    }

    const token = process.env.GITHUB_TOKEN;

    if (!token?.trim()) {
      return {
        ok: false,
        pullRequestUrl: null,
        pullRequestNumber: null,
        branch: null,
        error: "GITHUB_TOKEN is not set in Convex environment variables.",
      };
    }

    const { owner, repo } = MISSION_CONTROL;
    const headers = githubHeaders(token);

    try {
      const repoRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}`,
        { headers },
      );
      if (!repoRes.ok) {
        return {
          ok: false,
          pullRequestUrl: null,
          pullRequestNumber: null,
          branch: null,
          error: `Could not read repo (${repoRes.status}): ${await readGithubError(repoRes)}`,
        };
      }

      const repoJson = (await repoRes.json()) as { default_branch: string };
      const base = repoJson.default_branch;

      const baseSha = await getBranchHeadCommitSha(owner, repo, base, headers);
      if (!baseSha) {
        return {
          ok: false,
          pullRequestUrl: null,
          pullRequestNumber: null,
          branch: null,
          error: `Could not resolve default branch "${base}" to a commit (empty repo or missing ref).`,
        };
      }

      const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const branch = `convex-token-test-${suffix}`;
      const filePath = `convex-token-smoke-${suffix}.txt`;
      const fileBody = [
        "Convex GITHUB_TOKEN smoke test",
        `Created at ${new Date().toISOString()}`,
        "",
        "Safe to close this PR and delete the branch + file after verifying the token.",
      ].join("\n");

      const encodedPath = filePath
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");

      // Create the branch ref first. The Contents API often returns 404 if you only pass a new
      // branch name without an existing ref (auto-create is unreliable).
      const createRefRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/refs`,
        {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ref: `refs/heads/${branch}`,
            sha: baseSha,
          }),
        },
      );

      if (!createRefRes.ok) {
        return {
          ok: false,
          pullRequestUrl: null,
          pullRequestNumber: null,
          branch,
          error: `Could not create branch (${createRefRes.status}): ${await readGithubError(createRefRes)}`,
        };
      }

      const putRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`,
        {
          method: "PUT",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: "chore: Convex GITHUB_TOKEN smoke test",
            content: Buffer.from(fileBody, "utf8").toString("base64"),
            branch,
          }),
        },
      );

      if (!putRes.ok) {
        return {
          ok: false,
          pullRequestUrl: null,
          pullRequestNumber: null,
          branch,
          error: `Could not create test commit (${putRes.status}): ${await readGithubError(putRes)}`,
        };
      }

      const prRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls`,
        {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: "Convex dev tools: GITHUB_TOKEN smoke test",
            head: branch,
            base,
            body: [
              "Opened by **convex-todo-app** dev tools (`/dev`) to verify `GITHUB_TOKEN` can create commits and pull requests.",
              "",
              `Branch: \`${branch}\` · File: \`${filePath}\``,
            ].join("\n"),
          }),
        },
      );

      if (!prRes.ok) {
        return {
          ok: false,
          pullRequestUrl: null,
          pullRequestNumber: null,
          branch,
          error: `Commit succeeded but could not open PR (${prRes.status}): ${await readGithubError(prRes)}`,
        };
      }

      const prJson = (await prRes.json()) as {
        html_url?: string;
        number?: number;
      };

      return {
        ok: true,
        pullRequestUrl: prJson.html_url ?? null,
        pullRequestNumber: prJson.number ?? null,
        branch,
        error: null,
      };
    } catch (err) {
      return {
        ok: false,
        pullRequestUrl: null,
        pullRequestNumber: null,
        branch: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});