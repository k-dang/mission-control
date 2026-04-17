"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";

export const checkGithubToken = action({
  args: {},
  returns: v.object({
    configured: v.boolean(),
    authenticated: v.boolean(),
    login: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
  }),
  handler: async () => {
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
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token.trim()}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "convex-todo-app",
        },
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