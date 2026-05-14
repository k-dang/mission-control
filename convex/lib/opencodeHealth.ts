import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import { z } from "zod";

const OPENCODE_HEALTH_POLL_INTERVAL_MS = 500;
const OPENCODE_HEALTH_TIMEOUT_MS = 30_000;

const healthyResponseSchema = z.object({
  healthy: z.literal(true),
});

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForOpencodeHealth(client: OpencodeClient) {
  const deadline = Date.now() + OPENCODE_HEALTH_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const result = await client.global.health();

      const health = healthyResponseSchema.safeParse(result.data);
      if (!result.error && health.success) {
        return health.data;
      }
    } catch {
      // Ignore transient startup errors until the deadline expires.
    }

    if (Date.now() + OPENCODE_HEALTH_POLL_INTERVAL_MS >= deadline) {
      break;
    }

    await sleep(OPENCODE_HEALTH_POLL_INTERVAL_MS);
  }

  throw new Error(
    `OpenCode did not become healthy within ${OPENCODE_HEALTH_TIMEOUT_MS}ms`,
  );
}
