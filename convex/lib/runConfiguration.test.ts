import { describe, expect, it } from "vitest";
import {
  DEFAULT_RUN_CONFIGURATION,
  RUN_CONFIGURATION_HARNESSES,
  RUN_CONFIGURATION_PROVIDERS,
  UNKNOWN_RUN_CONFIGURATION_LABEL,
  describeRunConfiguration,
  isSupportedRunConfiguration,
  parseRunConfiguration,
} from "./runConfiguration";

describe("run configuration catalog", () => {
  it("includes OpenCode and Pi as known harnesses", () => {
    expect(RUN_CONFIGURATION_HARNESSES.map((harness) => harness.id)).toEqual([
      "opencode",
      "pi",
    ]);
  });

  it("includes Vercel AI Gateway, OpenRouter, and OpenCode Zen providers", () => {
    expect(RUN_CONFIGURATION_PROVIDERS.map((provider) => provider.id)).toEqual([
      "vercel",
      "openrouter",
      "opencode",
    ]);
  });

  it("exposes a supported default run configuration", () => {
    expect(DEFAULT_RUN_CONFIGURATION).toEqual({
      harnessId: "opencode",
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
        harnessId: "opencode",
        providerId: "openrouter",
        modelId: "moonshotai/kimi-k2.6:free",
      }),
    ).toEqual({
      ok: true,
      value: {
        harnessId: "opencode",
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
      error:
        "Unsupported run configuration: opencode/openrouter/moonshotai/kimi-k2.5",
      ok: false,
    });
  });

  it("parses legacy rows without a harness as OpenCode runs", () => {
    expect(
      parseRunConfiguration({
        providerId: "openrouter",
        modelId: "moonshotai/kimi-k2.6:free",
      }),
    ).toEqual({
      ok: true,
      value: {
        harnessId: "opencode",
        providerId: "openrouter",
        modelId: "moonshotai/kimi-k2.6:free",
      },
    });
  });

  it("rejects unsupported harness/provider/model combinations", () => {
    expect(
      parseRunConfiguration({
        harnessId: "retired-harness",
        providerId: "openrouter",
        modelId: "moonshotai/kimi-k2.6:free",
      }),
    ).toEqual({
      error:
        "Unsupported run configuration: retired-harness/openrouter/moonshotai/kimi-k2.6:free",
      ok: false,
    });
  });

  it("rejects a Pi harness with a model outside Pi's curated catalog", () => {
    expect(
      parseRunConfiguration({
        harnessId: "pi",
        providerId: "openrouter",
        modelId: "moonshotai/kimi-k2.6:free",
      }),
    ).toEqual({
      error:
        "Unsupported run configuration: pi/openrouter/moonshotai/kimi-k2.6:free",
      ok: false,
    });
  });

  it("parses Pi's curated OpenRouter and Vercel AI Gateway configurations", () => {
    expect(
      parseRunConfiguration({
        harnessId: "pi",
        providerId: "openrouter",
        modelId: "cohere/north-mini-code:free",
      }),
    ).toEqual({
      ok: true,
      value: {
        harnessId: "pi",
        providerId: "openrouter",
        modelId: "cohere/north-mini-code:free",
      },
    });

    expect(
      parseRunConfiguration({
        harnessId: "pi",
        providerId: "vercel-ai-gateway",
        modelId: "moonshotai/kimi-k2.5",
      }),
    ).toEqual({
      ok: true,
      value: {
        harnessId: "pi",
        providerId: "vercel-ai-gateway",
        modelId: "moonshotai/kimi-k2.5",
      },
    });
  });

  it("describes known, missing, and stale run configuration for display", () => {
    expect(
      describeRunConfiguration({
        harnessId: "opencode",
        providerId: "vercel",
        modelId: "moonshotai/kimi-k2.5",
      }),
    ).toBe("OpenCode · Vercel AI Gateway · Kimi K2.5");

    expect(
      describeRunConfiguration({
        providerId: "openrouter",
        modelId: "nvidia/nemotron-3-ultra-550b-a55b:free",
      }),
    ).toBe("OpenCode · OpenRouter · NVIDIA Nemotron 3 Ultra 550B Free");

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
        harnessId: "retired-harness",
        providerId: "legacy-provider",
        modelId: "legacy-model",
      }),
    ).toBe(UNKNOWN_RUN_CONFIGURATION_LABEL);
  });

});
