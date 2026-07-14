import {
  parseRunConfiguration,
  type PiRunConfigurationProviderId,
  type RunConfiguration,
} from "./runConfiguration";

/**
 * Pinned Pi release installed per Attempt Sandbox. Any pin change requires
 * compatibility tests and a fresh live smoke (docs/adr/0003).
 */
export const PI_VERSION = "0.80.6";

export const PI_PACKAGE_NAME = "@earendil-works/pi-coding-agent";

export const PI_BIN = "pi";

/**
 * Canonical map from a Pi run-configuration provider to the Convex env var
 * holding its credential. `satisfies Record<PiRunConfigurationProviderId, …>`
 * makes adding a Pi provider a compile error here until its credential env
 * var is declared.
 */
export const PI_PROVIDER_API_KEY_ENV = {
  "vercel-ai-gateway": "AI_GATEWAY_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
} as const satisfies Record<PiRunConfigurationProviderId, string>;

function isPiRunConfigurationProviderId(
  providerId: string,
): providerId is PiRunConfigurationProviderId {
  return providerId in PI_PROVIDER_API_KEY_ENV;
}

/**
 * Run Configurations never store secrets: this is the only place Pi
 * credentials are resolved, and they reach Pi only as Sandbox command env vars.
 */
export function resolvePiProviderApiKey(providerId: string): {
  envVar: string;
  apiKey: string;
} {
  if (!isPiRunConfigurationProviderId(providerId)) {
    throw new Error(`Unsupported Pi provider for run configuration: ${providerId}`);
  }

  const envVar = PI_PROVIDER_API_KEY_ENV[providerId];
  const apiKey = process.env[envVar]?.trim();
  if (!apiKey) {
    throw new Error(
      `${envVar} is required for Pi run configuration "${providerId}" (set in Convex env)`,
    );
  }

  return { envVar, apiKey };
}

/**
 * Builds the `--model <provider>/<modelId>` reference Pi expects. Pi splits
 * on only the first "/", so this is safe even though curated model ids (e.g.
 * "cohere/north-mini-code:free") contain further slashes.
 */
export function buildPiModelReference(configuration: RunConfiguration): string {
  const parsed = parseRunConfiguration(configuration);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  return `${parsed.value.providerId}/${parsed.value.modelId}`;
}
