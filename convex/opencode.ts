"use node";

import { createOpencodeClient } from "@opencode-ai/sdk/v2";
import type { Sandbox } from "@vercel/sandbox";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { createPullRequest } from "./lib/pullRequest";
import {
  DEFAULT_VERCEL_SMALL_MODEL,
  OPENCODE_PROVIDER_ID,
  type TerminalResult,
  waitForOpencodeTerminalState,
} from "./lib/opencodeHelpers";
import { setupOpencodeForTodo } from "./lib/opencodeSandbox";
import { getSandbox, stopSandboxSafely } from "./lib/sandboxHelpers";

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
      sandbox = await getSandbox(sandboxRow.sandboxId);

      const { publicUrl, sessionId } = await setupOpencodeForTodo(sandbox, {
        todo,
        todoId: args.todoId,
      });

      await ctx.runMutation(internal.todoSandboxes.markOpencodeStarted, {
        todoId: args.todoId,
        opencodeUrl: publicUrl,
        sessionId,
        startedAt: Date.now(),
      });
      await ctx.scheduler.runAfter(0, internal.opencode.monitorOpencodeStream, {
        opencodeSessionId: sessionId,
        opencodeUrl: publicUrl,
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
      await stopSandboxSafely({
        todoId: args.todoId,
        sandboxId: sandboxRow.sandboxId,
        sandbox,
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

      await stopSandboxSafely({
        todoId: args.todoId,
        sandboxId: args.sandboxId,
        sandbox,
      });
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
      await stopSandboxSafely({
        todoId: args.todoId,
        sandboxId: args.sandboxId,
        sandbox,
      });
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
