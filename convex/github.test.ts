import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  buildAuthenticatedRepoUrl,
  buildBranchName,
  createPR,
  parseGitHubRepoUrl,
} from "./github";

type MockCommandResult = {
  exitCode: number;
  output: () => Promise<Buffer>;
};

function commandResult(output: string, exitCode = 0): MockCommandResult {
  return {
    exitCode,
    output: async () => Buffer.from(output, "utf8"),
  };
}

function createSandboxMock(results: MockCommandResult[]) {
  return {
    runCommand: vi.fn(async () => {
      const next = results.shift();
      if (!next) {
        throw new Error("Unexpected sandbox command");
      }
      return next;
    }),
  };
}

describe("github helpers", () => {
  it("builds a deterministic branch name", () => {
    expect(buildBranchName("todo_123", 123456)).toBe("todo_123-123456");
    expect(buildBranchName(null, 123456)).toBe("feature/ai-changes-123456");
  });

  it("parses a GitHub repo URL", () => {
    expect(parseGitHubRepoUrl("https://github.com/acme/widgets.git")).toEqual({
      owner: "acme",
      repo: "widgets",
    });
  });

  it("rejects a non-GitHub repo URL", () => {
    expect(() => parseGitHubRepoUrl("https://gitlab.com/acme/widgets")).toThrow(
      "Invalid GitHub repository URL",
    );
  });

  it("builds an authenticated git remote URL", () => {
    expect(
      buildAuthenticatedRepoUrl("acme", "widgets", "token/with spaces"),
    ).toBe(
      "https://x-access-token:token%2Fwith%20spaces@github.com/acme/widgets.git",
    );
  });
});

describe("createPR", () => {
  const originalGithubToken = process.env.GITHUB_TOKEN;

  beforeEach(() => {
    process.env.GITHUB_TOKEN = "secret-token";
  });

  afterEach(() => {
    process.env.GITHUB_TOKEN = originalGithubToken;
    vi.restoreAllMocks();
  });

  it("throws when the sandbox has no changes", async () => {
    const sandbox = createSandboxMock([
      commandResult("https://github.com/acme/widgets.git\n"),
      commandResult(""),
      commandResult(""),
      commandResult(""),
    ]);

    await expect(
      createPR(sandbox as never, "https://github.com/acme/widgets", {
        title: "Test PR",
        body: "Hello",
        branch: "todo_123",
      }),
    ).rejects.toThrow("Sandbox has no changes to submit");

    expect(sandbox.runCommand).toHaveBeenCalledTimes(4);
  });

  it("creates a PR and restores the original remote", async () => {
    const sandbox = createSandboxMock([
      commandResult("https://github.com/acme/widgets.git\n"),
      commandResult(""),
      commandResult(""),
      commandResult(" M convex/github.ts\n"),
      commandResult("refs/remotes/origin/main\n"),
      commandResult(""),
      commandResult(""),
      commandResult(""),
      commandResult("convex/github.ts\n"),
      commandResult("[todo_123-111111] Test PR\n 1 file changed\n"),
      commandResult(""),
      commandResult(
        '{"html_url":"https://github.com/acme/widgets/pull/9","number":9}',
      ),
      commandResult(""),
    ]);

    vi.spyOn(Date, "now").mockReturnValue(111111);

    await expect(
      createPR(sandbox as never, "https://github.com/acme/widgets", {
        title: "Test PR",
        body: "Generated from tests.",
        branch: "todo_123",
      }),
    ).resolves.toEqual({
      branch: "todo_123-111111",
      prNumber: 9,
      prUrl: "https://github.com/acme/widgets/pull/9",
    });

    expect(sandbox.runCommand).toHaveBeenLastCalledWith("git", [
      "remote",
      "set-url",
      "origin",
      "https://github.com/acme/widgets.git",
    ]);
  });
});
