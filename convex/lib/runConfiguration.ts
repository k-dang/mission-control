export type RunConfigurationModel = {
  id: string;
  label: string;
};

export const RUN_CONFIGURATION_PROVIDERS = [
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
] as const satisfies readonly {
  id: string;
  label: string;
  models: readonly RunConfigurationModel[];
}[];

export type RunConfigurationProvider =
  (typeof RUN_CONFIGURATION_PROVIDERS)[number];

export type RunConfigurationProviderId = RunConfigurationProvider["id"];

export type RunConfiguration = {
  providerId: RunConfigurationProviderId;
  modelId: string;
};

export const DEFAULT_RUN_CONFIGURATION = {
  providerId: "vercel",
  modelId: "moonshotai/kimi-k2.5",
} as const satisfies RunConfiguration;

export type RunConfigurationLabel = {
  providerLabel: string;
  modelLabel: string;
};

export type ParseRunConfigurationResult =
  | { ok: true; value: RunConfiguration }
  | { ok: false; error: string };

function findProvider(providerId: string) {
  return RUN_CONFIGURATION_PROVIDERS.find(
    (provider) => provider.id === providerId,
  );
}

function findModel(providerId: string, modelId: string) {
  return findProvider(providerId)?.models.find((model) => model.id === modelId);
}

export function isSupportedRunConfiguration(
  configuration: {
    providerId: string;
    modelId: string;
  },
): configuration is RunConfiguration {
  return Boolean(
    findModel(configuration.providerId, configuration.modelId),
  );
}

export function parseRunConfiguration(configuration: {
  providerId: string;
  modelId: string;
}): ParseRunConfigurationResult {
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

export function getRunConfigurationLabel(configuration: {
  providerId: string;
  modelId: string;
}): RunConfigurationLabel | null {
  const provider = findProvider(configuration.providerId);
  const model = findModel(configuration.providerId, configuration.modelId);
  if (!provider || !model) {
    return null;
  }

  return {
    providerLabel: provider.label,
    modelLabel: model.label,
  };
}

export function formatRunConfigurationLabel(configuration: {
  providerId: string;
  modelId: string;
}): string | null {
  const label = getRunConfigurationLabel(configuration);
  if (!label) {
    return null;
  }

  return `${label.providerLabel} · ${label.modelLabel}`;
}
