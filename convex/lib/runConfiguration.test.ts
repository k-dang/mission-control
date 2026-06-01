import { describe, expect, it } from "vitest";
import {
  DEFAULT_RUN_CONFIGURATION,
  RUN_CONFIGURATION_PROVIDERS,
  formatRunConfigurationLabel,
  getRunConfigurationLabel,
  isSupportedRunConfiguration,
  parseRunConfiguration,
} from "./runConfiguration";

describe("run configuration catalog", () => {
  it("includes Vercel AI Gateway and OpenRouter providers", () => {
    expect(RUN_CONFIGURATION_PROVIDERS.map((provider) => provider.id)).toEqual([
      "vercel",
      "openrouter",
    ]);
  });

  it("exposes a supported default run configuration", () => {
    expect(DEFAULT_RUN_CONFIGURATION).toEqual({
      providerId: "vercel",
      modelId: "moonshotai/kimi-k2.5",
    });
    expect(isSupportedRunConfiguration(DEFAULT_RUN_CONFIGURATION)).toBe(true);
  });

  it("supports one curated model per provider", () => {
    expect(
      isSupportedRunConfiguration({
        providerId: "openrouter",
        modelId: "moonshotai/kimi-k2.6:free",
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

  it("returns display labels for supported configurations", () => {
    expect(
      getRunConfigurationLabel({
        providerId: "vercel",
        modelId: "moonshotai/kimi-k2.5",
      }),
    ).toEqual({
      modelLabel: "Kimi K2.5",
      providerLabel: "Vercel AI Gateway",
    });

    expect(
      formatRunConfigurationLabel({
        providerId: "openrouter",
        modelId: "moonshotai/kimi-k2.6:free",
      }),
    ).toBe("OpenRouter · Kimi K2.6 Free");
  });

  it("returns null labels for unsupported configurations", () => {
    expect(
      getRunConfigurationLabel({
        providerId: "vercel",
        modelId: "anthropic/unknown",
      }),
    ).toBeNull();
  });
});
