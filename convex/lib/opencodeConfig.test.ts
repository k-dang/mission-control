import { describe, expect, it } from "vitest";
import {
  buildOpencodeConfig,
  formatOpencodeModelId,
  getOpencodeMainModel,
} from "./opencodeConfig";

const apiKeys = {
  selectedProviderID: "openrouter",
  apiKey: "openrouter-key",
} as const;

describe("OpenCode config generation", () => {
  it("formats OpenCode model selections with provider prefixes", () => {
    expect(
      formatOpencodeModelId({
        providerID: "openrouter",
        modelID: "moonshotai/kimi-k2.6:free",
      }),
    ).toBe("openrouter/moonshotai/kimi-k2.6:free");
  });

  it("builds deterministic Vercel config for the selected main model", () => {
    const config = buildOpencodeConfig(
      {
        providerID: "vercel",
        modelID: "moonshotai/kimi-k2.5",
      },
      {
        selectedProviderID: "vercel",
        apiKey: "ai-gateway-key",
      },
    );

    expect(config).toEqual({
      $schema: "https://opencode.ai/config.json",
      enabled_providers: ["vercel"],
      provider: {
        vercel: {
          options: { apiKey: "ai-gateway-key" },
          models: {
            "moonshotai/kimi-k2.5": {},
          },
        },
      },
      model: "vercel/moonshotai/kimi-k2.5",
    });
  });

  it("builds deterministic OpenRouter config without requiring AI Gateway credentials", () => {
    const config = buildOpencodeConfig(
      {
        providerID: "openrouter",
        modelID: "nvidia/nemotron-3-ultra-550b-a55b:free",
      },
      apiKeys,
    );

    expect(config).toEqual({
      $schema: "https://opencode.ai/config.json",
      enabled_providers: ["openrouter"],
      provider: {
        openrouter: {
          options: { apiKey: "openrouter-key" },
          models: {
            "nvidia/nemotron-3-ultra-550b-a55b:free": {},
          },
        },
      },
      model: "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
    });
  });

  it("returns the selected model object used by OpenCode prompts", () => {
    expect(
      getOpencodeMainModel({
        providerId: "openrouter",
        modelId: "moonshotai/kimi-k2.6:free",
      }),
    ).toEqual({
      providerID: "openrouter",
      modelID: "moonshotai/kimi-k2.6:free",
    });
  });

  it("rejects mismatched credentials before config generation", () => {
    expect(() =>
      buildOpencodeConfig(
        {
          providerID: "openrouter",
          modelID: "moonshotai/kimi-k2.6:free",
        },
        {
          selectedProviderID: "vercel",
          apiKey: "ai-gateway-key",
        },
      ),
    ).toThrow(
      "OpenCode credential provider mismatch: vercel credentials cannot configure openrouter",
    );
  });

  it("rejects unsupported run configuration values before model selection", () => {
    expect(() =>
      getOpencodeMainModel({
        providerId: "openrouter",
        modelId: "moonshotai/kimi-k2.5",
      }),
    ).toThrow("Unsupported run configuration: openrouter/moonshotai/kimi-k2.5");
  });
});
