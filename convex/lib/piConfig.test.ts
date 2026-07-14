import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPiModelReference, resolvePiProviderApiKey } from "./piConfig";

describe("Pi config generation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds a provider/model reference even when the model id contains slashes", () => {
    expect(
      buildPiModelReference({
        harnessId: "pi",
        providerId: "openrouter",
        modelId: "cohere/north-mini-code:free",
      }),
    ).toBe("openrouter/cohere/north-mini-code:free");

    expect(
      buildPiModelReference({
        harnessId: "pi",
        providerId: "vercel-ai-gateway",
        modelId: "moonshotai/kimi-k2.5",
      }),
    ).toBe("vercel-ai-gateway/moonshotai/kimi-k2.5");
  });

  it("rejects unsupported run configurations before building a model reference", () => {
    expect(() =>
      buildPiModelReference({
        harnessId: "pi",
        providerId: "openrouter",
        modelId: "not-a-curated-model",
      }),
    ).toThrow(
      "Unsupported run configuration: pi/openrouter/not-a-curated-model",
    );
  });

  it("resolves a configured provider credential from the Convex environment", () => {
    vi.stubEnv("OPENROUTER_API_KEY", " openrouter-secret ");

    expect(resolvePiProviderApiKey("openrouter")).toEqual({
      envVar: "OPENROUTER_API_KEY",
      apiKey: "openrouter-secret",
    });
  });

  it("throws a clear error when the provider credential is unset", () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");

    expect(() => resolvePiProviderApiKey("vercel-ai-gateway")).toThrow(
      'AI_GATEWAY_API_KEY is required for Pi run configuration "vercel-ai-gateway" (set in Convex env)',
    );
  });

  it("throws a clear error for a provider id outside Pi's catalog", () => {
    expect(() => resolvePiProviderApiKey("opencode")).toThrow(
      "Unsupported Pi provider for run configuration: opencode",
    );
  });
});
