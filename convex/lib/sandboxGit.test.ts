import { describe, expect, it } from "vitest";
import { buildPullRequestBody } from "./sandboxGit";

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
