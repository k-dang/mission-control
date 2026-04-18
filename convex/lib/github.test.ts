import { describe, expect, it } from "vitest";
import { parseGithubRepoUrl } from "./github";

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
