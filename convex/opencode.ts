"use node";

import { createOpencodeClient } from "@opencode-ai/sdk";
import { Sandbox } from "@vercel/sandbox";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const OPENCODE_PORT = 4096;
const OPENCODE_BIN = "/home/vercel-sandbox/.opencode/bin/opencode";
const OPENCODE_CONFIG_PATH =
  "/home/vercel-sandbox/.config/opencode/opencode.json";
const OPENCODE_PROVIDER_ID = "vercel";
const DEFAULT_VERCEL_MODEL = "moonshotai/kimi-k2.5";
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

async function waitForOpencodeHealth(publicUrl: string) {
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

function buildOpencodeConfigJson(aiGatewayApiKey: string, modelId: string) {
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

function buildTodoPrompt(
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

function getOpencodeErrorMessage(error: unknown) {
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

export const runOpencodeForTodo = internalAction({
  args: {
    todoId: v.id("todos"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const todo = await ctx.runQuery(internal.todos.getById, {
      todoId: args.todoId,
    });
    if (!todo || !todo.sandboxId) {
      console.warn("Todo or sandbox not found, skipping opencode", {
        todoId: args.todoId,
      });
      return null;
    }

    try {
      const AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY;
      if (!AI_GATEWAY_API_KEY?.trim()) {
        throw new Error(
          "AI_GATEWAY_API_KEY is required for OpenCode with Vercel AI Gateway (set in Convex env)",
        );
      }

      const sandbox = await Sandbox.get({
        sandboxId: todo.sandboxId,
        token: process.env.VERCEL_TOKEN,
        teamId: process.env.VERCEL_TEAM_ID,
        projectId: process.env.VERCEL_PROJECT_ID,
      });

      console.info("Installing OpenCode", { todoId: args.todoId });
      const install = await sandbox.runCommand({
        cmd: "bash",
        args: ["-c", "curl -fsSL https://opencode.ai/install | bash"],
      });
      if (install.exitCode !== 0) {
        const installOut = (await install.output()).toString().trim();
        throw new Error(
          `OpenCode install failed (exit ${install.exitCode})${installOut ? `: ${installOut.slice(0, 2000)}` : ""}`,
        );
      }

      const version = await sandbox.runCommand(OPENCODE_BIN, ["--version"]);
      const versionText = (await version.output()).toString().trim();
      console.log("OpenCode version:", versionText);

      const opencodeConfig = buildOpencodeConfigJson(
        AI_GATEWAY_API_KEY,
        DEFAULT_VERCEL_MODEL,
      );
      await sandbox.writeFiles([
        {
          path: OPENCODE_CONFIG_PATH,
          content: Buffer.from(opencodeConfig, "utf8"),
        },
      ]);

      console.info("Starting OpenCode server", { todoId: args.todoId });
      await sandbox.runCommand({
        cmd: OPENCODE_BIN,
        args: ["serve", "--hostname", "0.0.0.0", "--port", `${OPENCODE_PORT}`],
        detached: true,
      });

      const opencodePublicUrl = sandbox.domain(OPENCODE_PORT);
      const health = await waitForOpencodeHealth(opencodePublicUrl);
      const client = createOpencodeClient({ baseUrl: opencodePublicUrl });
      const session = await client.session.create({
        body: { title: todo.title },
      });
      if (session.error || !session.data) {
        throw new Error(
          `Failed to create OpenCode session: ${getOpencodeErrorMessage(session.error)}`,
        );
      }

      console.info("OpenCode ready", {
        todoId: args.todoId,
        cliVersion: versionText,
        health: health,
        url: opencodePublicUrl,
      });

      const prompt = await client.session.prompt({
        path: { id: session.data.id },
        body: {
          model: {
            providerID: OPENCODE_PROVIDER_ID,
            modelID: DEFAULT_VERCEL_MODEL,
          },
          parts: [
            {
              type: "text",
              text: buildTodoPrompt(
                todo.title,
                todo.description,
                todo.githubUrl,
              ),
            },
          ],
        },
      });
      if (prompt.error) {
        throw new Error(
          `Failed to submit OpenCode prompt: ${getOpencodeErrorMessage(prompt.error)}`,
        );
      }

      // Only available in Pro or Enterprise plans
      // console.info("Updating network policy", { todoId: args.todoId });
      // await sandbox.updateNetworkPolicy({
      //   allow: {
      //     "ai-gateway.vercel.sh": [
      //       {
      //         transform: [
      //           {
      //             headers: { "x-api-key": aiGatewayApiKey },
      //           },
      //         ],
      //       },
      //     ],
      //   },
      // });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("OpenCode failed", { todoId: args.todoId, error: message });
      await ctx.runMutation(internal.sandboxStorage.markFailed, {
        todoId: args.todoId,
        error: message,
      });
      await ctx.runAction(internal.sandbox.shutdownSandboxForTodo, {
        todoId: args.todoId,
        sandboxId: todo.sandboxId,
      });
      throw error;
    }

    return null;
  },
});
