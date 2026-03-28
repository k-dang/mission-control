"use node";

import { randomBytes } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const OPENCODE_PORT = 4096;
const OPENCODE_BIN = "/home/vercel-sandbox/.opencode/bin/opencode";
const OPENCODE_CONFIG_PATH =
  "/home/vercel-sandbox/.config/opencode/opencode.json";
const DEFAULT_VERCEL_MODEL = "anthropic/claude-sonnet-4.6";
const OPENCODE_HEALTH_PATH = "/global/health";
const HEALTH_START_WAIT_MS = 8000;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildOpencodeConfigJson(modelId: string) {
  return JSON.stringify(
    {
      $schema: "https://opencode.ai/config.json",
      enabled_providers: ["vercel"],
      provider: {
        vercel: {
          options: {},
          models: { [modelId]: {} },
        },
      },
      model: modelId,
    },
    null,
    2,
  );
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

    const sandboxId = todo.sandboxId;

    try {
      const aiGatewayApiKey = process.env.AI_GATEWAY_API_KEY;
      if (!aiGatewayApiKey?.trim()) {
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

      const opencodeConfig = buildOpencodeConfigJson(DEFAULT_VERCEL_MODEL);
      await sandbox.writeFiles([
        {
          path: OPENCODE_CONFIG_PATH,
          content: Buffer.from(opencodeConfig, "utf8"),
        },
      ]);

      const serverPassword = randomBytes(24).toString("base64url");

      console.info("Starting OpenCode server", { todoId: args.todoId });
      await sandbox.runCommand({
        cmd: "bash",
        args: [
          "-lc",
          `nohup "${OPENCODE_BIN}" serve --hostname 0.0.0.0 --port ${OPENCODE_PORT} > /tmp/opencode.log 2>&1 &`,
        ],
        env: { OPENCODE_SERVER_PASSWORD: serverPassword },
      });

      await sleep(HEALTH_START_WAIT_MS);

      const publicUrl = `https://${sandbox.domain(OPENCODE_PORT)}`;
      const auth = Buffer.from(`opencode:${serverPassword}`, "utf8").toString(
        "base64",
      );

      const res = await fetch(`${publicUrl}${OPENCODE_HEALTH_PATH}`, {
        headers: { Authorization: `Basic ${auth}` },
      });

      if (!res.ok) {
        throw new Error(`OpenCode /global/health returned ${res.status}`);
      }

      const health = await res.json();
      if (
        typeof health !== "object" ||
        health === null ||
        !("healthy" in health) ||
        health.healthy !== true
      ) {
        throw new Error("OpenCode health check did not report healthy");
      }

      console.info("Updating network policy", { todoId: args.todoId });
      await sandbox.updateNetworkPolicy({
        allow: {
          "ai-gateway.vercel.sh": [
            {
              transform: [
                {
                  headers: { "x-api-key": aiGatewayApiKey },
                },
              ],
            },
          ],
        },
      });

      console.info("OpenCode ready", {
        todoId: args.todoId,
        cliVersion: versionText,
        health,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await ctx.runMutation(internal.sandboxStorage.markFailed, {
        todoId: args.todoId,
        error: message,
      });
      await ctx.runAction(internal.sandbox.shutdownSandboxForTodo, {
        todoId: args.todoId,
        sandboxId,
      });
      throw error;
    }

    return null;
  },
});
