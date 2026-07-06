import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateText, Output } from "ai";
import { generatePullRequestMetadataFromDiff } from "./pullRequest";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: {
    object: vi.fn((options) => ({ kind: "object-output", ...options })),
  },
}));

type PullRequestContext = Parameters<
  typeof generatePullRequestMetadataFromDiff
>[0];

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.stubEnv("AI_GATEWAY_API_KEY", "ai-gateway-key");
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
  vi.mocked(generateText).mockResolvedValue({
    output: {
      body: "  ## Summary\n- Adds PR metadata tests  ",
      title: "  Add PR metadata tests  ",
    },
  } as Awaited<ReturnType<typeof generateText>>);
}

function getPromptText() {
  return vi.mocked(generateText).mock.calls[0][0].prompt as string;
}

describe("generatePullRequestMetadataFromDiff", () => {
  it("returns normalized structured metadata from an AI SDK model call", async () => {
    mockStructuredMetadata();

    await expect(
      generatePullRequestMetadataFromDiff(createContext()),
    ).resolves.toEqual({
      body: "## Summary\n- Adds PR metadata tests",
      title: "Add PR metadata tests",
    });

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "openai/gpt-5-mini",
        output: expect.objectContaining({
          kind: "object-output",
          name: "pull_request_metadata",
        }),
      }),
    );
    expect(Output.object).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "pull_request_metadata",
        schema: expect.any(Object),
      }),
    );
  });

  it("sends task context and staged diff details to AI Gateway", async () => {
    mockStructuredMetadata();

    await generatePullRequestMetadataFromDiff(createContext());

    const promptText = getPromptText();
    expect(promptText).toContain(
      "Original task title: Add pull request tests\nOriginal task description: Add tests for PR metadata",
    );
    expect(promptText).toContain("Staged diff stat:\nfoo.ts | 1 +");
    expect(promptText).toContain(
      "Staged diff patch:\ndiff --git a/foo.ts b/foo.ts",
    );
  });

  it("truncates large staged diff patches in the metadata prompt", async () => {
    mockStructuredMetadata();

    await generatePullRequestMetadataFromDiff(
      createContext({
        staged: {
          diffPatch: "x".repeat(12_005),
          diffStat: "large.ts | 12005 +",
        },
      }),
    );

    const promptText = getPromptText();
    expect(promptText).toContain("x".repeat(12_000));
    expect(promptText).toContain("[truncated 5 characters]");
  });

  it("throws when AI Gateway returns invalid structured metadata", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { body: "", title: "Add tests" },
    } as Awaited<ReturnType<typeof generateText>>);

    await expect(
      generatePullRequestMetadataFromDiff(createContext()),
    ).rejects.toThrow(
      "AI SDK structured PR metadata response did not include a non-empty title and body",
    );
  });

  it("requires the deployment AI Gateway credential", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");

    await expect(
      generatePullRequestMetadataFromDiff(createContext()),
    ).rejects.toThrow(
      "AI_GATEWAY_API_KEY is required for PR metadata generation",
    );
  });

  it("surfaces AI SDK generation failures", async () => {
    vi.mocked(generateText).mockRejectedValue(new Error("unavailable"));

    await expect(
      generatePullRequestMetadataFromDiff(createContext()),
    ).rejects.toThrow("unavailable");
  });
});
