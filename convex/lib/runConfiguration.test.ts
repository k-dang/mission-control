import { describe, expect, it } from "vitest";
import {
  DEFAULT_RUN_CONFIGURATION,
  RUN_CONFIGURATION_PROVIDERS,
  UNKNOWN_RUN_CONFIGURATION_LABEL,
  describeRunConfiguration,
  isSupportedRunConfiguration,
  parseRunConfiguration,
} from "./runConfiguration";

describe("run configuration catalog", () => {
  it("includes Vercel AI Gateway, OpenRouter, and OpenCode Zen providers", () => {
    expect(RUN_CONFIGURATION_PROVIDERS.map((provider) => provider.id)).toEqual([
      "vercel",
      "openrouter",
      "opencode",
    ]);
  });

  it("exposes a supported default run configuration", () => {
    expect(DEFAULT_RUN_CONFIGURATION).toEqual({
      providerId: "vercel",
      modelId: "moonshotai/kimi-k2.5",
    });
    expect(isSupportedRunConfiguration(DEFAULT_RUN_CONFIGURATION)).toBe(true);
  });

  it("supports curated models per provider", () => {
    expect(
      isSupportedRunConfiguration({
        providerId: "openrouter",
        modelId: "moonshotai/kimi-k2.6:free",
      }),
    ).toBe(true);
    expect(
      isSupportedRunConfiguration({
        providerId: "openrouter",
        modelId: "nvidia/nemotron-3-ultra-550b-a55b:free",
      }),
    ).toBe(true);
    expect(
      isSupportedRunConfiguration({
        providerId: "opencode",
        modelId: "deepseek-v4-flash-free",
      }),
    ).toBe(true);
  });

  it("rejects unsupported provider/model combinations", () => {
    expect(
      isSupportedRunConfiguration({
        providerId: "vercel",
        modelId: "not-a-real-model",
      }),
    ).toBe(false);
    expect(
      isSupportedRunConfiguration({
        providerId: "not-a-provider",
        modelId: "openai/gpt-5",
      }),
    ).toBe(false);
  });

  it("parses supported configurations and reports unsupported ones", () => {
    expect(
      parseRunConfiguration({
        providerId: "openrouter",
        modelId: "moonshotai/kimi-k2.6:free",
      }),
    ).toEqual({
      ok: true,
      value: {
        providerId: "openrouter",
        modelId: "moonshotai/kimi-k2.6:free",
      },
    });

    expect(
      parseRunConfiguration({
        providerId: "openrouter",
        modelId: "moonshotai/kimi-k2.5",
      }),
    ).toEqual({
      error: "Unsupported run configuration: openrouter/moonshotai/kimi-k2.5",
      ok: false,
    });
  });

  it("describes known, missing, and stale run configuration for display", () => {
    expect(
      describeRunConfiguration({
        providerId: "vercel",
        modelId: "moonshotai/kimi-k2.5",
      }),
    ).toBe("Vercel AI Gateway · Kimi K2.5");

    expect(
      describeRunConfiguration({
        providerId: "openrouter",
        modelId: "nvidia/nemotron-3-ultra-550b-a55b:free",
      }),
    ).toBe("OpenRouter · NVIDIA Nemotron 3 Ultra 550B Free");

    expect(describeRunConfiguration(undefined)).toBe(
      UNKNOWN_RUN_CONFIGURATION_LABEL,
    );
    expect(describeRunConfiguration(null)).toBe(
      UNKNOWN_RUN_CONFIGURATION_LABEL,
    );

    // Unknown model under a known provider (e.g. retired after a run).
    expect(
      describeRunConfiguration({
        providerId: "vercel",
        modelId: "anthropic/unknown",
      }),
    ).toBe(UNKNOWN_RUN_CONFIGURATION_LABEL);

    // Entirely unknown provider.
    expect(
      describeRunConfiguration({
        providerId: "legacy-provider",
        modelId: "legacy-model",
      }),
    ).toBe(UNKNOWN_RUN_CONFIGURATION_LABEL);
  });
});
