import { describe, expect, it } from "vitest";
import { buildTodoPatchForPrVerificationOutcome } from "./todoPrOutcome";

describe("buildTodoPatchForPrVerificationOutcome", () => {
  it("trims and stores a verified PR URL", () => {
    expect(
      buildTodoPatchForPrVerificationOutcome({
        kind: "verified",
        prUrl: "  https://github.com/example/repo/pull/123  ",
      }),
    ).toEqual({
      prUrl: "https://github.com/example/repo/pull/123",
    });
  });

  it("fails when the verified PR URL is empty", () => {
    expect(() =>
      buildTodoPatchForPrVerificationOutcome({
        kind: "verified",
        prUrl: "   ",
      }),
    ).toThrow("Verified PR outcome requires a non-empty PR URL");
  });

  it("marks the todo as failed when PR verification fails", () => {
    expect(
      buildTodoPatchForPrVerificationOutcome({
        kind: "verificationFailed",
      }),
    ).toEqual({
      prUrl: undefined,
      status: "FAILED",
    });
  });
});
