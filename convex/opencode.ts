"use node";

import { createOpencodeClient } from "@opencode-ai/sdk/v2";
import type { Sandbox } from "@vercel/sandbox";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { createPullRequest } from "./lib/pullRequest";
import { getSandbox } from "./lib/sandboxHelpers";
import {
  buildOpencodeConfigJson,
  buildTodoPrompt,
  getOpencodeErrorMessage,
  type TerminalResult,
  waitForOpencodeHealth,
  waitForOpencodeTerminalState,
} from "./lib/opencodeHelpers";

const OPENCODE_PORT = 4096;
const OPENCODE_BIN = "/home/vercel-sandbox/.opencode/bin/opencode";
const OPENCODE_CONFIG_PATH =
  "/home/vercel-sandbox/.config/opencode/opencode.json";
const OPENCODE_PROVIDER_ID = "vercel";
const DEFAULT_VERCEL_MODEL = "moonshotai/kimi-k2.5";
const DEFAULT_VERCEL_SMALL_MODEL = "openai/gpt-5-nano";
const OPENCODE_MONITOR_SLICE_MS = 120_000;
const OPENCODE_MONITOR_RETRY_DELAY_MS = 1_000;

export const runTodo = internalAction({
  args: {
    todoId: v.id("todos"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const todo = await ctx.runQuery(internal.todos.getById, {
      todoId: args.todoId,
    });
    const sandboxRow = await ctx.runQuery(
      internal.todoSandboxes.getSandboxByTodoId,
      {
        todoId: args.todoId,
      },
    );
    if (!todo || !sandboxRow?.sandboxId) {
      console.warn("Todo or sandbox not found, skipping opencode", {
        todoId: args.todoId,
      });
      return null;
    }

    let sandbox: Sandbox | undefined;
    try {
      const AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY;
      if (!AI_GATEWAY_API_KEY?.trim()) {
        throw new Error(
          "AI_GATEWAY_API_KEY is required for OpenCode with Vercel AI Gateway (set in Convex env)",
        );
      }

      sandbox = await getSandbox(sandboxRow.sandboxId);

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
        DEFAULT_VERCEL_SMALL_MODEL,
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
      const client = createOpencodeClient({ baseUrl: opencodePublicUrl });
      const health = await waitForOpencodeHealth(client);
      const session = await client.session.create({
        title: todo.title,
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

      const prompt = await client.session.promptAsync({
        sessionID: session.data.id,
        model: {
          providerID: OPENCODE_PROVIDER_ID,
          modelID: DEFAULT_VERCEL_MODEL,
        },
        parts: [
          {
            type: "text",
            text: buildTodoPrompt(todo.title, todo.description, todo.githubUrl),
          },
        ],
      });
      if (prompt.error) {
        throw new Error(
          `Failed to submit OpenCode prompt: ${getOpencodeErrorMessage(prompt.error)}`,
        );
      }

      await ctx.runMutation(internal.todoSandboxes.markOpencodeStarted, {
        todoId: args.todoId,
        opencodeUrl: opencodePublicUrl,
        sessionId: session.data.id,
        startedAt: Date.now(),
      });
      await ctx.scheduler.runAfter(0, internal.opencode.monitorOpencodeStream, {
        opencodeSessionId: session.data.id,
        opencodeUrl: opencodePublicUrl,
        sandboxId: sandboxRow.sandboxId,
        todoDescription: todo.description,
        todoGithubUrl: todo.githubUrl,
        todoId: args.todoId,
        todoTitle: todo.title,
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
      await ctx.runMutation(internal.todos.updateInternal, {
        todoId: args.todoId,
        prUrl: null,
        status: "FAILED",
      });
      if (sandbox) {
        await stopSandboxSafely(sandbox, args.todoId, sandboxRow.sandboxId);
      } else {
        await ctx.runAction(internal.sandbox.shutdownSandboxForTodo, {
          todoId: args.todoId,
          sandboxId: sandboxRow.sandboxId,
        });
      }
      throw error;
    }

    return null;
  },
});

export const monitorOpencodeStream = internalAction({
  args: {
    opencodeSessionId: v.string(),
    opencodeUrl: v.string(),
    sandboxId: v.string(),
    todoDescription: v.optional(v.string()),
    todoGithubUrl: v.optional(v.string()),
    todoId: v.id("todos"),
    todoTitle: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sandbox = await getSandbox(args.sandboxId);

    try {
      const client = createOpencodeClient({ baseUrl: args.opencodeUrl });
      const outcome = await waitForOpencodeTerminalState(
        client,
        args.opencodeSessionId,
        args.todoId,
        { timeoutMs: OPENCODE_MONITOR_SLICE_MS },
      );

      if (outcome.kind === "retry") {
        await ctx.scheduler.runAfter(
          OPENCODE_MONITOR_RETRY_DELAY_MS,
          internal.opencode.monitorOpencodeStream,
          {
            opencodeSessionId: args.opencodeSessionId,
            opencodeUrl: args.opencodeUrl,
            sandboxId: args.sandboxId,
            todoDescription: args.todoDescription,
            todoGithubUrl: args.todoGithubUrl,
            todoId: args.todoId,
            todoTitle: args.todoTitle,
          },
        );
        return null;
      }

      const resolved = await resolveOpencodeOutcome(sandbox, args, outcome);
      await ctx.runMutation(internal.todoSessionState.setTerminalState, {
        todoId: args.todoId,
        streamState: outcome.terminalState,
        terminalAt: outcome.terminalAt,
        terminalReason: resolved.terminalReason,
        todoStatus: resolved.todoStatus,
        prUrl: resolved.prUrl,
      });

      if (resolved.prUrl) {
        await ctx.scheduler.runAfter(
          0,
          internal.notifications.sendDiscordWebhook,
          {
            content: `Pull request created for todo "${args.todoTitle}": ${resolved.prUrl}`,
            context: {
              todoId: args.todoId,
              sandboxId: args.sandboxId,
              prUrl: resolved.prUrl,
            },
          },
        );
      }

      await stopSandboxSafely(sandbox, args.todoId, args.sandboxId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("OpenCode monitor failed", {
        todoId: args.todoId,
        error: message,
      });
      await ctx.runMutation(internal.todos.updateInternal, {
        todoId: args.todoId,
        prUrl: null,
        status: "FAILED",
      });
      await stopSandboxSafely(sandbox, args.todoId, args.sandboxId);
      throw error;
    }

    return null;
  },
});

type FinalizeArgs = {
  opencodeSessionId: string;
  opencodeUrl: string;
  sandboxId: string;
  todoDescription?: string;
  todoGithubUrl?: string;
  todoId: Id<"todos">;
  todoTitle: string;
};

type ResolvedOpencodeOutcome = {
  todoStatus: "COMPLETED" | "FAILED";
  terminalReason: string | undefined;
  prUrl: string | undefined;
};

async function resolveOpencodeOutcome(
  sandbox: Sandbox,
  args: FinalizeArgs,
  terminal: TerminalResult,
): Promise<ResolvedOpencodeOutcome> {
  if (terminal.terminalState !== "COMPLETED") {
    return {
      todoStatus: "FAILED",
      terminalReason: terminal.terminalReason,
      prUrl: undefined,
    };
  }

  try {
    const result = await createPullRequest(sandbox, {
      title: args.todoTitle,
      description: args.todoDescription,
      repoUrl: args.todoGithubUrl,
      prSummary: {
        opencodeSessionId: args.opencodeSessionId,
        opencodeUrl: args.opencodeUrl,
        model: {
          modelID: DEFAULT_VERCEL_SMALL_MODEL,
          providerID: OPENCODE_PROVIDER_ID,
        },
      },
    });
    return {
      todoStatus: "COMPLETED",
      terminalReason: terminal.terminalReason,
      prUrl: result.kind === "noChanges" ? undefined : result.prUrl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("PR creation failed after OpenCode completed", {
      todoId: args.todoId,
      sandboxId: args.sandboxId,
      error: message,
    });
    return {
      todoStatus: "FAILED",
      terminalReason: `Post-run PR creation failed: ${message}`,
      prUrl: undefined,
    };
  }
}

async function stopSandboxSafely(
  sandbox: Sandbox,
  todoId: Id<"todos">,
  sandboxId: string,
) {
  try {
    await sandbox.stop();
    console.info("Sandbox stopped for todo", { todoId, sandboxId });
  } catch (error) {
    console.warn("Failed to stop sandbox", { todoId, sandboxId, error });
  }
}
