"use node";

import { createOpencodeClient } from "@opencode-ai/sdk/v2";
import type { Sandbox } from "@vercel/sandbox";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { createPullRequest } from "../lib/pullRequest";
import type { RunConfiguration } from "../lib/runConfiguration";
import { parseRunConfiguration } from "../lib/runConfiguration";
import {
  decideAttemptLifetime,
  resolveMaxAttemptDurationMs,
  type TerminalResult,
  waitForOpencodeTerminalState,
} from "../lib/opencodeStreamMonitor";
import { setupOpencodeForTodo } from "../lib/opencodeSandbox";
import { getSandbox, stopSandboxSafely } from "../lib/sandboxHelpers";
import { runConfigurationValidator } from "../lib/todoValidators";

const OPENCODE_MONITOR_RETRY_DELAY_MS = 1_000;

export const runTodo = internalAction({
  args: {
    todoId: v.id("todos"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [todo, sandboxRow] = await Promise.all([
      ctx.runQuery(internal.todos.getById, {
        todoId: args.todoId,
      }),
      ctx.runQuery(internal.todoSandboxes.getSandboxByTodoId, {
        todoId: args.todoId,
      }),
    ]);
    if (!todo || !sandboxRow?.sandboxId) {
      console.warn("Todo or sandbox not found, skipping opencode", {
        todoId: args.todoId,
      });
      return null;
    }
    let sandbox: Sandbox | undefined;
    try {
      if (!sandboxRow.runConfiguration) {
        throw new Error(
          `Run configuration missing for todo ${args.todoId}; cannot start OpenCode`,
        );
      }
      const runConfiguration = parseRunConfiguration(
        sandboxRow.runConfiguration,
      );
      if (!runConfiguration.ok) {
        throw new Error(runConfiguration.error);
      }

      sandbox = await getSandbox(sandboxRow.sandboxId);

      const { publicUrl, sessionId } = await setupOpencodeForTodo(sandbox, {
        todo,
        todoId: args.todoId,
        runConfiguration: runConfiguration.value,
      });

      const startedAt = Date.now();
      await ctx.runMutation(internal.todoRuns.recordOpencodeStarted, {
        todoId: args.todoId,
        opencodeUrl: publicUrl,
        sessionId,
        startedAt,
      });
      await ctx.scheduler.runAfter(
        0,
        internal.integrations.opencode.monitorOpencodeStream,
        {
          attemptStartedAt: startedAt,
          opencodeSessionId: sessionId,
          opencodeUrl: publicUrl,
          sandboxId: sandboxRow.sandboxId,
          todoDescription: todo.description,
          todoGithubUrl: todo.githubUrl,
          todoId: args.todoId,
          todoTitle: todo.title,
          runConfiguration: runConfiguration.value,
        },
      );

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
      await ctx.runMutation(internal.todoRuns.failOrchestration, {
        todoId: args.todoId,
        reason: message,
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
    attemptStartedAt: v.number(),
    opencodeSessionId: v.string(),
    opencodeUrl: v.string(),
    sandboxId: v.string(),
    todoDescription: v.optional(v.string()),
    todoGithubUrl: v.optional(v.string()),
    todoId: v.id("todos"),
    todoTitle: v.string(),
    runConfiguration: runConfigurationValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sandbox = await getSandbox(args.sandboxId);

    try {
      const maxAttemptDurationMs = resolveMaxAttemptDurationMs(
        process.env.MAX_ATTEMPT_DURATION_MS,
      );
      const lifetime = decideAttemptLifetime({
        startedAt: args.attemptStartedAt,
        now: Date.now(),
        maxAttemptDurationMs,
        sandboxDeadlineAt: sandbox.createdAt.getTime() + sandbox.timeout,
      });
      if (lifetime.kind === "timedOut") {
        console.warn("Attempt exceeded maximum duration, finalizing", {
          todoId: args.todoId,
          sandboxId: args.sandboxId,
          attemptStartedAt: args.attemptStartedAt,
        });
        await ctx.runMutation(internal.todoRuns.failOrchestration, {
          todoId: args.todoId,
          reason: `Attempt exceeded the maximum duration of ${Math.round(maxAttemptDurationMs / 60_000)} minutes`,
        });
        await stopSandboxSafely({
          todoId: args.todoId,
          sandboxId: args.sandboxId,
          sandbox,
        });
        return null;
      }
      if (lifetime.extendByMs > 0) {
        try {
          await sandbox.extendTimeout(lifetime.extendByMs);
        } catch (error) {
          console.warn("Failed to extend sandbox timeout", {
            todoId: args.todoId,
            sandboxId: args.sandboxId,
            error,
          });
        }
      }

      const client = createOpencodeClient({ baseUrl: args.opencodeUrl });
      const outcome = await waitForOpencodeTerminalState(
        client,
        args.opencodeSessionId,
        args.todoId,
        async (e) => {
          try {
            await ctx.runMutation(internal.todoEvents.append, {
              todoId: args.todoId,
              attemptId: args.opencodeSessionId,
              eventKey: e.eventKey,
              event: e.event,
            });
          } catch (err) {
            console.warn("Failed to append todo event", {
              todoId: args.todoId,
              err,
            });
          }
        },
      );

      if (outcome.kind === "retry") {
        await ctx.scheduler.runAfter(
          OPENCODE_MONITOR_RETRY_DELAY_MS,
          internal.integrations.opencode.monitorOpencodeStream,
          {
            attemptStartedAt: args.attemptStartedAt,
            opencodeSessionId: args.opencodeSessionId,
            opencodeUrl: args.opencodeUrl,
            sandboxId: args.sandboxId,
            todoDescription: args.todoDescription,
            todoGithubUrl: args.todoGithubUrl,
            todoId: args.todoId,
            todoTitle: args.todoTitle,
            runConfiguration: args.runConfiguration,
          },
        );
        return null;
      }

      const runConfiguration = parseRunConfiguration(args.runConfiguration);
      if (!runConfiguration.ok) {
        throw new Error(runConfiguration.error);
      }

      const resolved = await resolveOpencodeOutcome(
        sandbox,
        {
          ...args,
          runConfiguration: runConfiguration.value,
        },
        outcome,
      );
      await ctx.runMutation(internal.todoRuns.finish, {
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
          internal.integrations.notifications.sendDiscordWebhook,
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
      await ctx.runMutation(internal.todoRuns.failOrchestration, {
        todoId: args.todoId,
        reason: message,
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
  runConfiguration: RunConfiguration;
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
