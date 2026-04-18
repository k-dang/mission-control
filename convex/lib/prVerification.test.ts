import { describe, expect, it, vi } from "vitest";
import {
  classifyPrVerification,
  extractPrVerificationSignals,
  extractPrUrlFromText,
  looksLikeNoopAssistantResponse,
  parseGithubRepoUrl,
  parsePrUrl,
  prUrlMatchesRepo,
  verifyPrExistsOnGitHub,
} from "./prVerification";

describe("extractPrUrlFromText", () => {
  it("returns null when no PR URL is present", () => {
    expect(extractPrUrlFromText("no PR here")).toBeNull();
    expect(extractPrUrlFromText("")).toBeNull();
  });

  it("extracts a simple PR URL", () => {
    expect(
      extractPrUrlFromText(
        "Opened a PR at https://github.com/acme/widgets/pull/42",
      ),
    ).toBe("https://github.com/acme/widgets/pull/42");
  });

  it("returns the last PR URL when multiple are present", () => {
    expect(
      extractPrUrlFromText(
        "See older https://github.com/acme/widgets/pull/1 and newer https://github.com/acme/widgets/pull/7",
      ),
    ).toBe("https://github.com/acme/widgets/pull/7");
  });

  it("strips trailing punctuation", () => {
    expect(
      extractPrUrlFromText(
        "Done: https://github.com/acme/widgets/pull/42.",
      ),
    ).toBe("https://github.com/acme/widgets/pull/42");
  });
});

describe("parsePrUrl", () => {
  it("parses a PR URL into owner, repo, and number", () => {
    expect(parsePrUrl("https://github.com/acme/widgets/pull/42")).toEqual({
      owner: "acme",
      repo: "widgets",
      number: 42,
      canonicalUrl: "https://github.com/acme/widgets/pull/42",
    });
  });

  it("strips a .git suffix from the repo", () => {
    expect(parsePrUrl("https://github.com/acme/widgets.git/pull/42")).toEqual({
      owner: "acme",
      repo: "widgets",
      number: 42,
      canonicalUrl: "https://github.com/acme/widgets/pull/42",
    });
  });

  it("returns null for unrelated URLs", () => {
    expect(parsePrUrl("https://example.com")).toBeNull();
    expect(parsePrUrl("https://github.com/acme/widgets")).toBeNull();
  });
});

describe("parseGithubRepoUrl", () => {
  it("parses https clone URLs", () => {
    expect(parseGithubRepoUrl("https://github.com/acme/widgets.git")).toEqual({
      owner: "acme",
      repo: "widgets",
    });
  });

  it("parses plain repo URLs", () => {
    expect(parseGithubRepoUrl("https://github.com/acme/widgets")).toEqual({
      owner: "acme",
      repo: "widgets",
    });
  });

  it("returns null for non-github URLs", () => {
    expect(parseGithubRepoUrl("https://gitlab.com/acme/widgets")).toBeNull();
  });
});

describe("prUrlMatchesRepo", () => {
  it("is case-insensitive", () => {
    expect(
      prUrlMatchesRepo(
        {
          owner: "Acme",
          repo: "Widgets",
          number: 1,
          canonicalUrl: "https://github.com/Acme/Widgets/pull/1",
        },
        { owner: "acme", repo: "widgets" },
      ),
    ).toBe(true);
  });

  it("rejects mismatched owner or repo", () => {
    expect(
      prUrlMatchesRepo(
        {
          owner: "acme",
          repo: "widgets",
          number: 1,
          canonicalUrl: "https://github.com/acme/widgets/pull/1",
        },
        { owner: "acme", repo: "gadgets" },
      ),
    ).toBe(false);
  });
});

describe("classifyPrVerification", () => {
  it("returns verified when a verified PR URL is present", () => {
    expect(
      classifyPrVerification({
        candidatePrUrl: "https://github.com/acme/widgets/pull/7",
        finalAssistantText: "Opened a PR.",
        verified: true,
      }),
    ).toEqual({
      kind: "verified",
      prUrl: "https://github.com/acme/widgets/pull/7",
    });
  });

  it("returns noop when the final assistant response clearly reports a no-op", () => {
    expect(
      classifyPrVerification({
        candidatePrUrl: null,
        finalAssistantText: "No files changed, so I did not create a pull request.",
        verified: false,
      }),
    ).toEqual({ kind: "noop" });
  });

  it("returns verificationFailed when no PR was verified and the response was not a no-op", () => {
    expect(
      classifyPrVerification({
        candidatePrUrl: "https://github.com/acme/widgets/pull/7",
        finalAssistantText: "I attempted to create a pull request.",
        verified: false,
      }),
    ).toEqual({ kind: "verificationFailed" });
  });
});

describe("extractPrVerificationSignals", () => {
  it("scans assistant history and keeps the latest PR URL", () => {
    expect(
      extractPrVerificationSignals([
        {
          info: { role: "assistant", time: { created: 1 } },
          parts: [{ type: "text", text: "Started work." }],
        },
        {
          info: { role: "assistant", time: { created: 2 } },
          parts: [
            {
              type: "text",
              text: "Opened https://github.com/acme/widgets/pull/3",
            },
          ],
        },
        {
          info: { role: "assistant", time: { created: 3 } },
          parts: [
            {
              type: "text",
              text: "Final PR: https://github.com/acme/widgets/pull/7",
            },
            { type: "text", text: "ignored", synthetic: true },
          ],
        },
      ]),
    ).toEqual({
      candidatePrUrl: "https://github.com/acme/widgets/pull/7",
      finalAssistantText: "Final PR: https://github.com/acme/widgets/pull/7",
    });
  });

  it("returns an empty final assistant text when no assistant messages exist", () => {
    expect(
      extractPrVerificationSignals([
        {
          info: { role: "user", time: { created: 1 } },
          parts: [{ type: "text", text: "hello" }],
        },
      ]),
    ).toEqual({
      candidatePrUrl: null,
      finalAssistantText: "",
    });
  });
});

describe("looksLikeNoopAssistantResponse", () => {
  it("detects no-op phrasing from the final assistant response", () => {
    expect(
      looksLikeNoopAssistantResponse(
        "No files changed, so I did not create a pull request.",
      ),
    ).toBe(true);
    expect(looksLikeNoopAssistantResponse("Nothing to commit.")).toBe(true);
  });

  it("does not treat generic text as a no-op", () => {
    expect(
      looksLikeNoopAssistantResponse("I opened a pull request for review."),
    ).toBe(false);
  });
});

describe("verifyPrExistsOnGitHub", () => {
  const parsedPr = {
    owner: "acme",
    repo: "widgets",
    number: 7,
    canonicalUrl: "https://github.com/acme/widgets/pull/7",
  };

  it("returns true when GitHub responds 200 with a PR body", async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 200,
      json: async () => ({ state: "open" }),
    })) as unknown as typeof fetch;

    await expect(
      verifyPrExistsOnGitHub(parsedPr, "token", fetchImpl),
    ).resolves.toBe(true);

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/widgets/pulls/7",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token",
        }),
      }),
    );
  });

  it("omits auth header when token is absent", async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 200,
      json: async () => ({ state: "open" }),
    })) as unknown as typeof fetch;

    await verifyPrExistsOnGitHub(parsedPr, undefined, fetchImpl);
    const call = (fetchImpl as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0];
    const headers = (call[1] as { headers: Record<string, string> }).headers;
    expect(headers.Authorization).toBeUndefined();
  });

  it("returns false for a 404 response", async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 404,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    await expect(
      verifyPrExistsOnGitHub(parsedPr, "token", fetchImpl),
    ).resolves.toBe(false);
  });
});
