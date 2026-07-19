export type RunConfigurationModel = {
  id: string;
  label: string;
};

export type RunConfigurationProviderCatalogEntry = {
  id: string;
  label: string;
  models: readonly RunConfigurationModel[];
};

export type RunConfigurationHarnessCatalogEntry = {
  id: string;
  label: string;
  providers: readonly RunConfigurationProviderCatalogEntry[];
};

export const OPENCODE_HARNESS_ID = "opencode";
export const PI_HARNESS_ID = "pi";

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

export const PI_RUN_CONFIGURATION_PROVIDER_OPTIONS = [
  {
    id: "vercel-ai-gateway",
    label: "Vercel AI Gateway",
    models: [{ id: "moonshotai/kimi-k2.5", label: "Kimi K2.5" }],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    models: [
      { id: "cohere/north-mini-code:free", label: "Cohere North Mini Code Free" },
    ],
  },
] as const satisfies readonly RunConfigurationProviderCatalogEntry[];

export const RUN_CONFIGURATION_HARNESSES = [
  {
    id: OPENCODE_HARNESS_ID,
    label: "OpenCode",
    providers: RUN_CONFIGURATION_PROVIDER_OPTIONS,
  },
  {
    id: PI_HARNESS_ID,
    label: "Pi",
    providers: PI_RUN_CONFIGURATION_PROVIDER_OPTIONS,
  },
] as const satisfies readonly RunConfigurationHarnessCatalogEntry[];

export const RUN_CONFIGURATION_PROVIDERS = RUN_CONFIGURATION_PROVIDER_OPTIONS;

export type RunConfigurationHarness =
  (typeof RUN_CONFIGURATION_HARNESSES)[number];

export type RunConfigurationHarnessId = RunConfigurationHarness["id"];

export type RunConfigurationProvider =
  (typeof RUN_CONFIGURATION_PROVIDER_OPTIONS)[number];

/** OpenCode's own provider id union, scoped for OpenCode-only code (e.g. its credential env var map). */
export type OpencodeRunConfigurationProviderId = RunConfigurationProvider["id"];

export type PiRunConfigurationProvider =
  (typeof PI_RUN_CONFIGURATION_PROVIDER_OPTIONS)[number];

/** Pi's own provider id union, scoped for Pi-only code (e.g. its credential env var map). */
export type PiRunConfigurationProviderId = PiRunConfigurationProvider["id"];

/** Every provider id valid under any declared Harness. Used by the harness-neutral run configuration shape. */
export type RunConfigurationProviderId =
  RunConfigurationHarness["providers"][number]["id"];

export type RunConfiguration = {
  harnessId: RunConfigurationHarnessId;
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
  harnessId?: string;
  providerId: string;
  modelId: string;
};

export const DEFAULT_RUN_CONFIGURATION = {
  harnessId: OPENCODE_HARNESS_ID,
  providerId: "vercel",
  modelId: "moonshotai/kimi-k2.5",
} as const satisfies RunConfiguration;

export type ParseRunConfigurationResult =
  | { ok: true; value: RunConfiguration }
  | { ok: false; error: string };

function normalizeHarnessId(harnessId: string | undefined) {
  return harnessId ?? OPENCODE_HARNESS_ID;
}

function findHarness(harnessId: string | undefined) {
  const normalizedHarnessId = normalizeHarnessId(harnessId);
  return RUN_CONFIGURATION_HARNESSES.find(
    (harness) => harness.id === normalizedHarnessId,
  );
}

function findProvider(harnessId: string | undefined, providerId: string) {
  return findHarness(harnessId)?.providers.find(
    (provider) => provider.id === providerId,
  );
}

function findModel(
  harnessId: string | undefined,
  providerId: string,
  modelId: string,
) {
  return findProvider(harnessId, providerId)?.models.find(
    (model) => model.id === modelId,
  );
}

export function isSupportedRunConfiguration(
  configuration: RunConfigurationInput,
): boolean {
  return Boolean(
    findModel(
      configuration.harnessId,
      configuration.providerId,
      configuration.modelId,
    ),
  );
}

export function parseRunConfiguration(
  configuration: RunConfigurationInput,
): ParseRunConfigurationResult {
  const harness = findHarness(configuration.harnessId);
  const provider = findProvider(
    configuration.harnessId,
    configuration.providerId,
  );
  const model = findModel(
    configuration.harnessId,
    configuration.providerId,
    configuration.modelId,
  );

  if (harness && provider && model) {
    return {
      ok: true,
      value: {
        providerId: provider.id,
        modelId: model.id,
        harnessId: harness.id,
      },
    };
  }

  return {
    ok: false,
    error: `Unsupported run configuration: ${normalizeHarnessId(configuration.harnessId)}/${configuration.providerId}/${configuration.modelId}`,
  };
}

export const UNKNOWN_RUN_CONFIGURATION_LABEL = "Unknown run configuration";

/**
 * Human-readable "Harness · Provider · Model" label for a stored or loosely-typed run
 * configuration, falling back to {@link UNKNOWN_RUN_CONFIGURATION_LABEL} when it
 * is absent or no longer in the catalog (e.g. a model retired after the run).
 */
export function describeRunConfiguration(
  runConfiguration: RunConfigurationInput | undefined | null,
): string {
  if (!runConfiguration) {
    return UNKNOWN_RUN_CONFIGURATION_LABEL;
  }

  const harness = findHarness(runConfiguration.harnessId);
  const provider = findProvider(
    runConfiguration.harnessId,
    runConfiguration.providerId,
  );
  const model = findModel(
    runConfiguration.harnessId,
    runConfiguration.providerId,
    runConfiguration.modelId,
  );
  if (!harness || !provider || !model) {
    return UNKNOWN_RUN_CONFIGURATION_LABEL;
  }

  return `${harness.label} · ${provider.label} · ${model.label}`;
}
