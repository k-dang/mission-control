export type TodoPrVerificationOutcome =
  | {
      kind: "verified";
      prUrl: string;
    }
  | {
      kind: "verificationFailed";
    };

export function buildTodoPatchForPrVerificationOutcome(
  outcome: TodoPrVerificationOutcome,
): {
  prUrl?: string;
  status?: "FAILED";
} {
  if (outcome.kind === "verified") {
    const prUrl = outcome.prUrl.trim();
    if (!prUrl) {
      throw new Error("Verified PR outcome requires a non-empty PR URL");
    }
    return { prUrl };
  }

  return {
    prUrl: undefined,
    status: "FAILED",
  };
}
