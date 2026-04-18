"use node";

import { createOpencodeClient } from "@opencode-ai/sdk/v2";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type ActionCtx, internalAction } from "./_generated/server";
import {
  createPullRequestForSandbox,
  generatePullRequestMetadataForSandbox,
  getSandbox,
} from "./lib/sandboxHelpers";
import {
  buildOpencodeConfigJson,
  buildTodoPrompt,
  getOpencodeErrorMessage,
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
const OPENCODE_MONITOR_SLICE_MS = 60_000;
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
      internal.sandboxStorage.getSandboxByTodoId,
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

    try {
      const AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY;
      if (!AI_GATEWAY_API_KEY?.trim()) {
        throw new Error(
          "AI_GATEWAY_API_KEY is required for OpenCode with Vercel AI Gateway (set in Convex env)",
        );
      }

      const sandbox = await getSandbox(sandboxRow.sandboxId);

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
            text: buildTodoPrompt(
              todo.title,
              todo.description,
              todo.githubUrl,
            ),
          },
        ],
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
      await ctx.runAction(internal.sandbox.shutdownSandboxForTodo, {
        todoId: args.todoId,
        sandboxId: sandboxRow.sandboxId,
      });
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

      if (outcome.kind === "stream_unrecoverable") {
        await finalizeOpencodeRun({
          ctx,
          opencode: {
            sessionId: args.opencodeSessionId,
            url: args.opencodeUrl,
          },
          sandbox,
          sandboxId: args.sandboxId,
          terminal: {
            terminalAt: Date.now(),
            terminalReason: `OpenCode event stream failed: ${outcome.reason}`,
            terminalState: "FAILED",
          },
          todo: {
            description: args.todoDescription,
            githubUrl: args.todoGithubUrl,
            id: args.todoId,
            title: args.todoTitle,
          },
        });
        return null;
      }

      if (outcome.kind === "slice_timeout" || outcome.kind === "handoff") {
        const status = await client.session.status();
        const sessionStatus = status.data?.[args.opencodeSessionId];
        if (sessionStatus?.type === "idle") {
          await finalizeOpencodeRun({
            ctx,
            opencode: {
              sessionId: args.opencodeSessionId,
              url: args.opencodeUrl,
            },
            sandbox,
            sandboxId: args.sandboxId,
            terminal: {
              terminalAt: Date.now(),
              terminalReason: "Detected idle status during scheduled monitor handoff",
              terminalState: "COMPLETED",
            },
            todo: {
              description: args.todoDescription,
              githubUrl: args.todoGithubUrl,
              id: args.todoId,
              title: args.todoTitle,
            },
          });
          return null;
        }

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

      await finalizeOpencodeRun({
        ctx,
        opencode: {
          sessionId: args.opencodeSessionId,
          url: args.opencodeUrl,
        },
        sandbox,
        sandboxId: args.sandboxId,
        terminal: outcome.outcome.terminal,
        todo: {
          description: args.todoDescription,
          githubUrl: args.todoGithubUrl,
          id: args.todoId,
          title: args.todoTitle,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("OpenCode monitor failed", { todoId: args.todoId, error: message });
      await ctx.runMutation(internal.todos.updateInternal, {
        todoId: args.todoId,
        prUrl: null,
        status: "FAILED",
      });
      await ctx.runAction(internal.sandbox.shutdownSandboxForTodo, {
        todoId: args.todoId,
        sandboxId: args.sandboxId,
      });
      throw error;
    }

    return null;
  },
});

type TodoRunContext = {
  description: string | undefined;
  githubUrl: string | undefined;
  id: Id<"todos">;
  title: string;
};

type OpencodeRunContext = {
  sessionId: string;
  url: string;
};

async function finalizeOpencodeRun(params: {
  ctx: ActionCtx;
  opencode: OpencodeRunContext;
  sandbox: Awaited<ReturnType<typeof getSandbox>>;
  sandboxId: string;
  terminal: {
    terminalAt: number;
    terminalReason?: string;
    terminalState: "COMPLETED" | "FAILED" | "CANCELLED";
  };
  todo: TodoRunContext;
}) {
  const { ctx, opencode, sandbox, sandboxId, terminal, todo } = params;

  await ctx.runMutation(internal.sandboxStorage.setOpencodeTerminalState, {
    todoId: todo.id,
    streamState: terminal.terminalState,
    terminalAt: terminal.terminalAt,
    terminalReason: terminal.terminalReason,
  });

  if (terminal.terminalState === "FAILED") {
    await ctx.runMutation(internal.todos.updateInternal, {
      todoId: todo.id,
      prUrl: null,
      status: "FAILED",
    });
  }

  if (terminal.terminalState === "COMPLETED") {
    await persistCompletedRunOutcome({
      ctx,
      opencode,
      sandbox,
      sandboxId,
      todo,
    });
  }

  await ctx.runAction(internal.sandbox.shutdownSandboxForTodo, {
    todoId: todo.id,
    sandboxId,
  });
}

async function persistCompletedRunOutcome(params: {
  ctx: ActionCtx;
  opencode: OpencodeRunContext;
  sandbox: Awaited<ReturnType<typeof getSandbox>>;
  sandboxId: string;
  todo: TodoRunContext;
}) {
  const { ctx, opencode, sandbox, sandboxId, todo } = params;

  try {
    const metadataResult = await generatePullRequestMetadataForSandbox(
      sandbox,
      todo.title,
      todo.description,
      opencode.sessionId,
      opencode.url,
      {
        modelID: DEFAULT_VERCEL_SMALL_MODEL,
        providerID: OPENCODE_PROVIDER_ID,
      },
    );

    if (metadataResult.kind === "noChanges") {
      // OpenCode finished successfully but left no net diff, so there is
      // nothing to commit or turn into a pull request for this todo.
      await ctx.runMutation(internal.todos.updateInternal, {
        todoId: todo.id,
        prUrl: null,
        status: "COMPLETED",
      });
      return;
    }

    const result = await createPullRequestForSandbox(
      sandbox,
      metadataResult.prMetadata,
      todo.githubUrl,
      process.env.GITHUB_TOKEN,
    );

    await ctx.runMutation(internal.todos.updateInternal, {
      todoId: todo.id,
      prUrl: result.prUrl,
      status: "COMPLETED",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("PR creation failed after OpenCode completed", {
      todoId: todo.id,
      sandboxId,
      error: message,
    });
    await ctx.runMutation(internal.sandboxStorage.setOpencodeTerminalReason, {
      todoId: todo.id,
      terminalReason: `Post-run PR creation failed: ${message}`,
    });
    await ctx.runMutation(internal.todos.updateInternal, {
      todoId: todo.id,
      prUrl: null,
      status: "FAILED",
    });
  }
}
