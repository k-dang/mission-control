import { createOpencodeClient } from "@opencode-ai/sdk/v2";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generatePullRequestMetadataFromDiff } from "./pullRequest";

const opencodeMocks = vi.hoisted(() => {
  const prompt = vi.fn();
  return {
    createOpencodeClient: vi.fn(() => ({ session: { prompt } })),
    prompt,
  };
});

vi.mock("@opencode-ai/sdk/v2", () => ({
  createOpencodeClient: opencodeMocks.createOpencodeClient,
}));

type PullRequestContext = Parameters<
  typeof generatePullRequestMetadataFromDiff
>[0];

beforeEach(() => {
  vi.clearAllMocks();
});

function createContext(
  overrides: Partial<PullRequestContext> = {},
): PullRequestContext {
  return {
    description: "Add tests for PR metadata",
    repo: {
      baseBranch: "main",
      owner: "acme",
      repo: "widgets",
    },
    staged: {
      diffPatch: "diff --git a/foo.ts b/foo.ts\n+export const foo = true;",
      diffStat: "foo.ts | 1 +",
    },
    title: "Add pull request tests",
    ...overrides,
  };
}

function mockStructuredMetadata() {
  opencodeMocks.prompt.mockResolvedValue({
    data: {
      info: {
        structured: {
          body: "  ## Summary\n- Adds PR metadata tests  ",
          title: "  Add PR metadata tests  ",
        },
      },
    },
  });
}

describe("generatePullRequestMetadataFromDiff", () => {
  it("returns normalized structured metadata from OpenCode", async () => {
    mockStructuredMetadata();

    await expect(
      generatePullRequestMetadataFromDiff(createContext(), {
        model: { modelID: "gpt-5.5", providerID: "openai" },
        opencodeSessionId: " session_123 ",
        opencodeUrl: " http://localhost:4096 ",
      }),
    ).resolves.toEqual({
      body: "## Summary\n- Adds PR metadata tests",
      title: "Add PR metadata tests",
    });

    expect(createOpencodeClient).toHaveBeenCalledWith({
      baseUrl: "http://localhost:4096",
    });
    expect(opencodeMocks.prompt).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { modelID: "gpt-5.5", providerID: "openai" },
        sessionID: "session_123",
      }),
    );
  });

  it("sends task context and staged diff details to OpenCode", async () => {
    mockStructuredMetadata();

    await generatePullRequestMetadataFromDiff(createContext(), {
      model: { modelID: "gpt-5.5", providerID: "openai" },
      opencodeSessionId: "session_123",
      opencodeUrl: "http://localhost:4096",
    });

    const promptText = opencodeMocks.prompt.mock.calls[0][0].parts[0].text;
    expect(promptText).toContain(
      "Original task title: Add pull request tests\nOriginal task description: Add tests for PR metadata",
    );
    expect(promptText).toContain("Staged diff stat:\nfoo.ts | 1 +");
    expect(promptText).toContain(
      "Staged diff patch:\ndiff --git a/foo.ts b/foo.ts",
    );
  });

  it("truncates large staged diff patches in the OpenCode prompt", async () => {
    mockStructuredMetadata();

    await generatePullRequestMetadataFromDiff(
      createContext({
        staged: {
          diffPatch: "x".repeat(12_005),
          diffStat: "large.ts | 12005 +",
        },
      }),
      {
        model: { modelID: "gpt-5.5", providerID: "openai" },
        opencodeSessionId: "session_123",
        opencodeUrl: "http://localhost:4096",
      },
    );

    const promptText = opencodeMocks.prompt.mock.calls[0][0].parts[0].text;
    expect(promptText).toContain("x".repeat(12_000));
    expect(promptText).toContain("[truncated 5 characters]");
  });

  it("throws when OpenCode returns invalid structured metadata", async () => {
    opencodeMocks.prompt.mockResolvedValue({
      data: { info: { structured: { body: "", title: "Add tests" } } },
    });

    await expect(
      generatePullRequestMetadataFromDiff(createContext(), {
        model: { modelID: "gpt-5.5", providerID: "openai" },
        opencodeSessionId: "session_123",
        opencodeUrl: "http://localhost:4096",
      }),
    ).rejects.toThrow(
      "OpenCode structured PR metadata response did not include a non-empty title and body",
    );
  });

  it("requires OpenCode session details", async () => {
    await expect(
      generatePullRequestMetadataFromDiff(createContext(), {
        model: { modelID: "gpt-5.5", providerID: "openai" },
        opencodeSessionId: " ",
        opencodeUrl: "http://localhost:4096",
      }),
    ).rejects.toThrow("PR metadata generation requires OpenCode session details");
  });
});
