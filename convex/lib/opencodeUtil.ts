const OPENCODE_HEALTH_PATH = "/global/health";
const HEALTH_TIMEOUT_MS = 20_000;
const HEALTH_POLL_INTERVAL_MS = 4_000;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHealthyResponse(health: unknown): health is { healthy: true } {
  return (
    typeof health === "object" &&
    health !== null &&
    "healthy" in health &&
    health.healthy === true
  );
}

export async function waitForOpencodeHealth(publicUrl: string) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let lastFailure = "no response received";
  let attempt = 0;
  const healthUrl = `${publicUrl}${OPENCODE_HEALTH_PATH}`;

  await sleep(HEALTH_POLL_INTERVAL_MS);

  while (Date.now() < deadline) {
    attempt += 1;
    try {
      const res = await fetch(healthUrl);

      if (!res.ok) {
        lastFailure = `health endpoint returned ${res.status}`;
        console.info("OpenCode health check pending", {
          attempt,
          status: res.status,
          url: healthUrl,
        });
      } else {
        const health = await res.json();
        if (isHealthyResponse(health)) {
          console.info("OpenCode health check passed", {
            attempt,
            url: healthUrl,
          });
          return health;
        }
        lastFailure = "health endpoint did not report healthy";
        console.info("OpenCode health check pending", {
          attempt,
          reason: lastFailure,
          url: healthUrl,
        });
      }
    } catch (error) {
      lastFailure =
        error instanceof Error ? error.message : "health check failed";
      console.info("OpenCode health check pending", {
        attempt,
        reason: lastFailure,
        url: healthUrl,
      });
    }

    await sleep(HEALTH_POLL_INTERVAL_MS);
  }

  throw new Error(
    `OpenCode did not become healthy within ${HEALTH_TIMEOUT_MS}ms: ${lastFailure}`,
  );
}

export function buildOpencodeConfigJson(
  aiGatewayApiKey: string,
  modelId: string,
) {
  return JSON.stringify(
    {
      $schema: "https://opencode.ai/config.json",
      enabled_providers: ["vercel"],
      provider: {
        vercel: {
          options: { apiKey: aiGatewayApiKey },
          models: { [modelId]: {} },
        },
      },
      model: modelId,
    },
    null,
    2,
  );
}

export function buildTodoPrompt(
  title: string,
  description?: string,
  githubUrl?: string,
) {
  const lines = [
    "Understand the codebase before making changes, then implement the requested task with minimal, correct edits.",
    "Run the most relevant validation for the files you change before you finish.",
    "Task:",
    title.trim(),
  ];

  const trimmedDescription = description?.trim();
  if (trimmedDescription) {
    lines.push("", "Additional context:", trimmedDescription);
  }

  if (githubUrl?.trim()) {
    lines.push("", "Repository:", githubUrl.trim());
  }

  lines.push(
    "Expected outcome:",
    "1. Make the code changes needed to complete the task.",
    "2. Run relevant validation commands for the change.",
    "3. Summarize what you changed and any follow-up risks or notes.",
  );

  return lines.join("\n");
}

export function getOpencodeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}
