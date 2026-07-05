import {
  parseRunConfiguration,
  type RunConfiguration,
  type RunConfigurationProviderId,
} from "./runConfiguration";

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

export type OpencodeConfigApiKeys = {
  selectedProviderID: RunConfigurationProviderId;
  apiKey: string;
};

/**
 * Canonical map from a run-configuration provider to the Convex env var holding
 * its OpenCode credential. `satisfies Record<RunConfigurationProviderId, …>`
 * makes adding a provider to the catalog a compile error here until its
 * credential env var is declared — so the provider/credential knowledge lives
 * in exactly one place.
 */
export const OPENCODE_PROVIDER_API_KEY_ENV = {
  vercel: "AI_GATEWAY_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  opencode: "OPENCODE_ZEN_API_KEY",
} as const satisfies Record<RunConfigurationProviderId, string>;

function isRunConfigurationProviderId(
  providerID: string,
): providerID is RunConfigurationProviderId {
  return providerID in OPENCODE_PROVIDER_API_KEY_ENV;
}

/**
 * Reads the OpenCode credential for `providerID` from the Convex environment,
 * throwing a clear error when the provider is unknown or its key is unset.
 */
export function readOpencodeConfigApiKeys(
  providerID: string,
): OpencodeConfigApiKeys {
  if (!isRunConfigurationProviderId(providerID)) {
    throw new Error(
      `Unsupported OpenCode provider for run configuration: ${providerID}`,
    );
  }

  const envVar = OPENCODE_PROVIDER_API_KEY_ENV[providerID];
  const apiKey = process.env[envVar]?.trim();
  if (!apiKey) {
    throw new Error(
      `${envVar} is required for OpenCode run configuration "${providerID}" (set in Convex env)`,
    );
  }

  return { selectedProviderID: providerID, apiKey };
}

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

  const provider: Record<string, OpencodeProviderConfig> = {
    [mainModel.providerID]: {
      options: { apiKey: apiKeys.apiKey },
      models: {
        [mainModel.modelID]: {},
      },
    },
  };

  return {
    $schema: "https://opencode.ai/config.json",
    enabled_providers: Object.keys(provider),
    provider,
    model: formatOpencodeModelId(mainModel),
  };
}
