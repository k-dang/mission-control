"use node";

import { createOpencodeClient } from "@opencode-ai/sdk";
import { Sandbox } from "@vercel/sandbox";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type ActionCtx, internalAction } from "./_generated/server";
import { createPullRequestForSandbox } from "./lib/sandboxGit";
import {
  buildOpencodeConfigJson,
  buildTodoPrompt,
  getOpencodeErrorMessage,
  waitForOpencodeHealth,
  waitForOpencodeTerminalState,
} from "./lib/opencodeUtil";

const OPENCODE_PORT = 4096;
const OPENCODE_BIN = "/home/vercel-sandbox/.opencode/bin/opencode";
const OPENCODE_CONFIG_PATH =
  "/home/vercel-sandbox/.config/opencode/opencode.json";
const OPENCODE_PROVIDER_ID = "vercel";
const DEFAULT_VERCEL_MODEL = "moonshotai/kimi-k2.5";
const OPENCODE_MONITOR_SLICE_MS = 60_000;
const OPENCODE_MONITOR_RETRY_DELAY_MS = 1_000;

export const runOpencodeForTodo = internalAction({
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

      const prompt = await client.session.promptAsync({
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
      await ctx.scheduler.runAfter(0, internal.opencode.monitorOpencodeForTodo, {
        todoId: args.todoId,
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

export const monitorOpencodeForTodo = internalAction({
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

    if (!todo || !sandboxRow?.sandboxId || !sandboxRow.opencode.url || !sandboxRow.opencode.sessionId) {
      console.warn("OpenCode monitor missing session state, skipping", {
        todoId: args.todoId,
      });
      return null;
    }

    if (sandboxRow.opencode.streamState !== "STARTED") {
      console.info("OpenCode monitor found non-started state, skipping", {
        todoId: args.todoId,
        streamState: sandboxRow.opencode.streamState,
      });
      return null;
    }

    try {
      const client = createOpencodeClient({ baseUrl: sandboxRow.opencode.url });
      const outcome = await waitForOpencodeTerminalState(
        client,
        sandboxRow.opencode.sessionId,
        args.todoId,
        { timeoutMs: OPENCODE_MONITOR_SLICE_MS },
      );

      if (outcome.kind === "stream_unrecoverable") {
        await finalizeOpencodeRun({
          ctx,
          sandboxId: sandboxRow.sandboxId,
          terminal: {
            terminalAt: Date.now(),
            terminalReason: `OpenCode event stream failed: ${outcome.reason}`,
            terminalState: "FAILED",
          },
          todoDescription: todo.description,
          todoGithubUrl: todo.githubUrl,
          todoId: args.todoId,
          todoTitle: todo.title,
        });
        return null;
      }

      if (outcome.kind === "slice_timeout" || outcome.kind === "handoff") {
        const status = await client.session.status();
        const sessionStatus = status.data?.[sandboxRow.opencode.sessionId];
        if (sessionStatus?.type === "idle") {
          await finalizeOpencodeRun({
            ctx,
            sandboxId: sandboxRow.sandboxId,
            terminal: {
              terminalAt: Date.now(),
              terminalReason: "Detected idle status during scheduled monitor handoff",
              terminalState: "COMPLETED",
            },
            todoDescription: todo.description,
            todoGithubUrl: todo.githubUrl,
            todoId: args.todoId,
            todoTitle: todo.title,
          });
          return null;
        }

        await ctx.scheduler.runAfter(
          OPENCODE_MONITOR_RETRY_DELAY_MS,
          internal.opencode.monitorOpencodeForTodo,
          {
            todoId: args.todoId,
          },
        );
        return null;
      }

      await finalizeOpencodeRun({
        ctx,
        sandboxId: sandboxRow.sandboxId,
        terminal: outcome.outcome.terminal,
        todoDescription: todo.description,
        todoGithubUrl: todo.githubUrl,
        todoId: args.todoId,
        todoTitle: todo.title,
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
        sandboxId: sandboxRow.sandboxId,
      });
      throw error;
    }

    return null;
  },
});

async function finalizeOpencodeRun(params: {
  ctx: ActionCtx;
  sandboxId: string;
  terminal: {
    terminalAt: number;
    terminalReason?: string;
    terminalState: "COMPLETED" | "FAILED" | "CANCELLED";
  };
  todoDescription: string | undefined;
  todoGithubUrl: string | undefined;
  todoId: Id<"todos">;
  todoTitle: string;
}) {
  const {
    ctx,
    sandboxId,
    terminal,
    todoDescription,
    todoGithubUrl,
    todoId,
    todoTitle,
  } = params;

  await ctx.runMutation(internal.sandboxStorage.setOpencodeTerminalState, {
    todoId,
    streamState: terminal.terminalState,
    terminalAt: terminal.terminalAt,
    terminalReason: terminal.terminalReason,
  });

  if (terminal.terminalState === "FAILED") {
    await ctx.runMutation(internal.todos.updateInternal, {
      todoId,
      prUrl: null,
      status: "FAILED",
    });
  }

  if (terminal.terminalState === "COMPLETED") {
    await persistCompletedRunOutcome({
      ctx,
      sandboxId,
      todoDescription,
      todoGithubUrl,
      todoId,
      todoTitle,
    });
  }

  await ctx.runAction(internal.sandbox.shutdownSandboxForTodo, {
    todoId,
    sandboxId,
  });
}

async function persistCompletedRunOutcome(params: {
  ctx: ActionCtx;
  sandboxId: string;
  todoDescription: string | undefined;
  todoGithubUrl: string | undefined;
  todoId: Id<"todos">;
  todoTitle: string;
}) {
  const { ctx, sandboxId, todoDescription, todoGithubUrl, todoId, todoTitle } =
    params;

  try {
    const result = await createPullRequestForSandbox({
      description: todoDescription,
      githubToken: process.env.GITHUB_TOKEN,
      repoUrl: todoGithubUrl,
      sandboxId,
      title: todoTitle,
    });

    if (result.kind === "noChanges") {
      // OpenCode finished successfully but left no net diff, so there is
      // nothing to commit or turn into a pull request for this todo.
      await ctx.runMutation(internal.todos.updateInternal, {
        todoId,
        prUrl: null,
        status: "COMPLETED",
      });
      return;
    }

    await ctx.runMutation(internal.todos.updateInternal, {
      todoId,
      prUrl: result.prUrl,
      status: "COMPLETED",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("PR creation failed after OpenCode completed", {
      todoId,
      sandboxId,
      error: message,
    });
    await ctx.runMutation(internal.sandboxStorage.setOpencodeTerminalReason, {
      todoId,
      terminalReason: `Post-run PR creation failed: ${message}`,
    });
    await ctx.runMutation(internal.todos.updateInternal, {
      todoId,
      prUrl: null,
      status: "FAILED",
    });
  }
}
