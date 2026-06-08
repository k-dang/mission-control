export type RunConfigurationModel = {
  id: string;
  label: string;
};

export const RUN_CONFIGURATION_PROVIDER_OPTIONS = [
  {
    id: "vercel",
    label: "Vercel AI Gateway",
    models: [
      { id: "moonshotai/kimi-k2.5", label: "Kimi K2.5" },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    models: [
      { id: "moonshotai/kimi-k2.6:free", label: "Kimi K2.6 Free" },
      {
        id: "nvidia/nemotron-3-ultra-550b-a55b:free",
        label: "NVIDIA Nemotron 3 Ultra 550B Free",
      },
    ],
  },
  {
    id: "opencode",
    label: "OpenCode Zen",
    models: [
      { id: "deepseek-v4-flash-free", label: "DeepSeek V4 Flash Free" },
    ],
  },
] as const satisfies readonly {
  id: string;
  label: string;
  models: readonly RunConfigurationModel[];
}[];

export const RUN_CONFIGURATION_PULL_REQUEST_METADATA_MODELS = {
  vercel: "moonshotai/kimi-k2.5",
  openrouter: "nvidia/nemotron-3-ultra-550b-a55b:free",
  opencode: "big-pickle",
} as const satisfies Record<
  (typeof RUN_CONFIGURATION_PROVIDER_OPTIONS)[number]["id"],
  string
>;

export const RUN_CONFIGURATION_PROVIDERS = RUN_CONFIGURATION_PROVIDER_OPTIONS;

export type RunConfigurationProvider =
  (typeof RUN_CONFIGURATION_PROVIDER_OPTIONS)[number];

export type RunConfigurationProviderId = RunConfigurationProvider["id"];

export type RunConfiguration = {
  providerId: RunConfigurationProviderId;
  modelId: string;
};

export type ProviderModelSelection = {
  providerId: RunConfigurationProviderId;
  modelId: string;
};

/**
 * Loosely-typed provider/model pair as it may arrive from stored data or the
 * client, before it has been validated against the catalog. Use
 * {@link RunConfiguration} for values known to be supported.
 */
export type RunConfigurationInput = {
  providerId: string;
  modelId: string;
};

export const DEFAULT_RUN_CONFIGURATION = {
  providerId: "vercel",
  modelId: "moonshotai/kimi-k2.5",
} as const satisfies RunConfiguration;

export type ParseRunConfigurationResult =
  | { ok: true; value: RunConfiguration }
  | { ok: false; error: string };

function findProvider(providerId: string) {
  return RUN_CONFIGURATION_PROVIDER_OPTIONS.find(
    (provider) => provider.id === providerId,
  );
}

function findModel(providerId: string, modelId: string) {
  return findProvider(providerId)?.models.find((model) => model.id === modelId);
}

export function isSupportedRunConfiguration(
  configuration: RunConfigurationInput,
): configuration is RunConfiguration {
  return Boolean(findModel(configuration.providerId, configuration.modelId));
}

export function parseRunConfiguration(
  configuration: RunConfigurationInput,
): ParseRunConfigurationResult {
  if (isSupportedRunConfiguration(configuration)) {
    return {
      ok: true,
      value: {
        providerId: configuration.providerId,
        modelId: configuration.modelId,
      },
    };
  }

  return {
    ok: false,
    error: `Unsupported run configuration: ${configuration.providerId}/${configuration.modelId}`,
  };
}

export function getPullRequestMetadataModel(
  configuration: RunConfiguration,
): ProviderModelSelection {
  const parsed = parseRunConfiguration(configuration);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  return {
    providerId: parsed.value.providerId,
    modelId:
      RUN_CONFIGURATION_PULL_REQUEST_METADATA_MODELS[
        parsed.value.providerId
      ],
  };
}

export const UNKNOWN_RUN_CONFIGURATION_LABEL = "Unknown run configuration";

/**
 * Human-readable "Provider · Model" label for a stored or loosely-typed run
 * configuration, falling back to {@link UNKNOWN_RUN_CONFIGURATION_LABEL} when it
 * is absent or no longer in the catalog (e.g. a model retired after the run).
 */
export function describeRunConfiguration(
  runConfiguration: RunConfigurationInput | undefined | null,
): string {
  if (!runConfiguration) {
    return UNKNOWN_RUN_CONFIGURATION_LABEL;
  }

  const provider = findProvider(runConfiguration.providerId);
  const model = findModel(runConfiguration.providerId, runConfiguration.modelId);
  if (!provider || !model) {
    return UNKNOWN_RUN_CONFIGURATION_LABEL;
  }

  return `${provider.label} · ${model.label}`;
}
