"use node";

import { createOpencodeClient } from "@opencode-ai/sdk";
import { Sandbox } from "@vercel/sandbox";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import {
  buildOpencodeConfigJson,
  buildTodoPrompt,
  getOpencodeErrorMessage,
  waitForOpencodeHealth,
} from "./lib/opencodeUtil";

const OPENCODE_PORT = 4096;
const OPENCODE_BIN = "/home/vercel-sandbox/.opencode/bin/opencode";
const OPENCODE_CONFIG_PATH =
  "/home/vercel-sandbox/.config/opencode/opencode.json";
const OPENCODE_PROVIDER_ID = "vercel";
const DEFAULT_VERCEL_MODEL = "moonshotai/kimi-k2.5";

export const runOpencodeForTodo = internalAction({
  args: {
    todoId: v.id("todos"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const todo = await ctx.runQuery(internal.todos.getById, {
      todoId: args.todoId,
    });
    const sandboxRow = await ctx.runQuery(internal.sandboxStorage.getSandboxByTodoId, {
      todoId: args.todoId,
    });
    if (!todo || !sandboxRow?.sandboxId) {
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
        sandboxId: sandboxRow.sandboxId,
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

      await ctx.runMutation(internal.sandboxStorage.markOpencodeStarted, {
        todoId: args.todoId,
        opencodeUrl: opencodePublicUrl,
        sessionId: session.data.id,
        startedAt: Date.now(),
      });

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
        sandboxId: sandboxRow.sandboxId,
      });
      throw error;
    }

    return null;
  },
});
