import { parseRunConfiguration, type RunConfiguration } from "./runConfiguration";

export const OPENCODE_PORT = 4096;
export const OPENCODE_VERSION = "1.14.48";
export const OPENCODE_BIN = "/home/vercel-sandbox/.opencode/bin/opencode";
export const OPENCODE_CONFIG_PATH =
  "/home/vercel-sandbox/.config/opencode/opencode.json";
export const OPENCODE_PROVIDER_ID = "vercel";
export const DEFAULT_VERCEL_MODEL = "moonshotai/kimi-k2.5";

type OpencodeProviderConfig = {
  options: {
    apiKey: string;
  };
  models: Record<string, object>;
};

export type OpencodeModelSelection = {
  providerID: string;
  modelID: string;
};

export type OpencodeConfigApiKeys =
  | {
      selectedProviderID: "vercel";
      aiGatewayApiKey: string;
    }
  | {
      selectedProviderID: "openrouter";
      openRouterApiKey: string;
    };

export function formatOpencodeModelId(selection: OpencodeModelSelection) {
  return `${selection.providerID}/${selection.modelID}`;
}

export function getOpencodeMainModel(
  configuration: RunConfiguration,
): OpencodeModelSelection {
  const parsed = parseRunConfiguration(configuration);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  return {
    providerID: parsed.value.providerId,
    modelID: parsed.value.modelId,
  };
}

export function buildOpencodeConfig(
  mainModel: OpencodeModelSelection,
  apiKeys: OpencodeConfigApiKeys,
) {
  if (apiKeys.selectedProviderID !== mainModel.providerID) {
    throw new Error(
      `OpenCode credential provider mismatch: ${apiKeys.selectedProviderID} credentials cannot configure ${mainModel.providerID}`,
    );
  }

  const provider: Record<string, OpencodeProviderConfig> = {};

  if (
    mainModel.providerID === "vercel" &&
    apiKeys.selectedProviderID === "vercel"
  ) {
    provider.vercel = {
      options: { apiKey: apiKeys.aiGatewayApiKey },
      models: {
        [mainModel.modelID]: {},
      },
    };
  } else if (
    mainModel.providerID === "openrouter" &&
    apiKeys.selectedProviderID === "openrouter"
  ) {
    provider.openrouter = {
      options: { apiKey: apiKeys.openRouterApiKey },
      models: {
        [mainModel.modelID]: {},
      },
    };
  } else {
    throw new Error(
      `Unsupported OpenCode provider for run configuration: ${mainModel.providerID}`,
    );
  }

  return {
    $schema: "https://opencode.ai/config.json",
    enabled_providers: Object.keys(provider),
    provider,
    model: formatOpencodeModelId(mainModel),
    small_model: formatOpencodeModelId(mainModel),
  };
}
