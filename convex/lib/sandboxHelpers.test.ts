import { describe, expect, it } from "vitest";
import {
  buildFallbackPullRequestMetadata,
  buildPullRequestBody,
  normalizePullRequestMetadata,
} from "./sandboxHelpers";

describe("buildPullRequestBody", () => {
  it("reuses the todo description when present", () => {
    expect(
      buildPullRequestBody("Ship feature", "  Detailed todo description.  "),
    ).toBe("Detailed todo description.");
  });

  it("falls back to the todo title when description is missing", () => {
    expect(buildPullRequestBody("Ship feature")).toBe(
      "Automated PR for todo: Ship feature",
    );
  });
});

describe("normalizePullRequestMetadata", () => {
  it("returns trimmed structured PR metadata", () => {
    expect(
      normalizePullRequestMetadata({
        body: "  ## Summary\n- Adds structured PR generation  ",
        title: "  Generate PR metadata with structured output  ",
      }),
    ).toEqual({
      body: "## Summary\n- Adds structured PR generation",
      title: "Generate PR metadata with structured output",
    });
  });

  it("returns null when the structured payload is incomplete", () => {
    expect(
      normalizePullRequestMetadata({
        body: "## Summary\n- Missing title",
      }),
    ).toBeNull();
    expect(
      normalizePullRequestMetadata({
        body: "   ",
        title: "Has title",
      }),
    ).toBeNull();
  });
});

describe("buildFallbackPullRequestMetadata", () => {
  it("uses the trimmed title and todo description", () => {
    expect(
      buildFallbackPullRequestMetadata(
        "  Generate PR metadata first  ",
        "  ## Summary\n- Reuses the todo description  ",
      ),
    ).toEqual({
      body: "## Summary\n- Reuses the todo description",
      title: "Generate PR metadata first",
    });
  });
});
