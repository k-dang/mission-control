"use node";

import { createOpencodeClient } from "@opencode-ai/sdk/v2";
import type { Sandbox } from "@vercel/sandbox";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { createPullRequest } from "../lib/pullRequest";
import { parseRunConfiguration } from "../lib/runConfiguration";
import {
  decideAttemptLifetime,
  resolveMaxAttemptDurationMs,
  type TerminalResult,
  waitForOpencodeTerminalState,
} from "../lib/opencodeStreamMonitor";
import { setupOpencodeForTodo } from "../lib/opencodeSandbox";
import { getSandbox, stopSandboxSafely } from "../lib/sandboxHelpers";

const OPENCODE_MONITOR_RETRY_DELAY_MS = 1_000;

export const runTodo = internalAction({
  args: { todoId: v.id("todos"), attemptId: v.id("todoAttempts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [todo, attempt] = await Promise.all([
      ctx.runQuery(internal.todos.getById, { todoId: args.todoId }),
      ctx.runQuery(internal.todoAttempts.getById, { attemptId: args.attemptId }),
    ]);
    if (!todo || !attempt?.isActive || attempt.todoId !== args.todoId || !attempt.sandboxId) {
      return null;
    }

    let sandbox: Sandbox | undefined;
    try {
      if (!attempt.runConfiguration) throw new Error("Run configuration missing for Attempt");
      const runConfiguration = parseRunConfiguration(attempt.runConfiguration);
      if (!runConfiguration.ok) throw new Error(runConfiguration.error);
      sandbox = await getSandbox(attempt.sandboxId);
      const { publicUrl, sessionId } = await setupOpencodeForTodo(sandbox, {
        todo,
        todoId: args.todoId,
        runConfiguration: runConfiguration.value,
      });
      const startedAt = Date.now();
      const recorded = await ctx.runMutation(internal.todoRuns.recordOpencodeStarted, {
        attemptId: args.attemptId,
        opencodeUrl: publicUrl,
        sessionId,
        startedAt,
      });
      if (!recorded) {
        await stopSandboxSafely({
          todoId: args.todoId,
          attemptId: args.attemptId,
          sandboxId: attempt.sandboxId,
          sandbox,
        });
        return null;
      }
      await ctx.scheduler.runAfter(0, internal.integrations.opencode.monitorOpencodeStream, {
        attemptId: args.attemptId,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      await ctx.runMutation(internal.todoRuns.failOrchestration, { attemptId: args.attemptId, reason });
      await stopSandboxSafely({
        todoId: args.todoId,
        attemptId: args.attemptId,
        sandboxId: attempt.sandboxId,
        sandbox,
      });
      throw error;
    }
    return null;
  },
});

export const monitorOpencodeStream = internalAction({
  args: { attemptId: v.id("todoAttempts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const attempt = await ctx.runQuery(internal.todoAttempts.getById, { attemptId: args.attemptId });
    if (!attempt?.isActive || !attempt.sandboxId || !attempt.harnessUrl || !attempt.harnessRunId) {
      return null;
    }
    const todo = await ctx.runQuery(internal.todos.getById, { todoId: attempt.todoId });
    if (!todo) return null;
    const sandbox = await getSandbox(attempt.sandboxId);

    try {
      const maxAttemptDurationMs = resolveMaxAttemptDurationMs(process.env.MAX_ATTEMPT_DURATION_MS);
      const lifetime = decideAttemptLifetime({
        // The 30-minute lifetime covers provisioning and OpenCode setup too,
        // not merely the time after the upstream session starts streaming.
        startedAt: attempt._creationTime,
        now: Date.now(),
        maxAttemptDurationMs,
        sandboxDeadlineAt: sandbox.createdAt.getTime() + sandbox.timeout,
      });
      if (lifetime.kind === "timedOut") {
        await ctx.runMutation(internal.todoRuns.failOrchestration, {
          attemptId: args.attemptId,
          reason: `Attempt exceeded the maximum duration of ${Math.round(maxAttemptDurationMs / 60_000)} minutes`,
        });
        await stopSandboxSafely({ todoId: todo._id, attemptId: args.attemptId, sandboxId: attempt.sandboxId, sandbox });
        return null;
      }
      if (lifetime.extendByMs > 0) {
        try {
          await sandbox.extendTimeout(lifetime.extendByMs);
        } catch (error) {
          console.warn("Failed to extend sandbox timeout", { attemptId: args.attemptId, error });
        }
      }

      const outcome = await waitForOpencodeTerminalState(
        createOpencodeClient({ baseUrl: attempt.harnessUrl }),
        attempt.harnessRunId,
        todo._id,
        async (event) => {
          try {
            await ctx.runMutation(internal.todoEvents.append, {
              todoId: todo._id,
              attemptId: args.attemptId,
              eventKey: event.eventKey,
              event: event.event,
            });
          } catch (error) {
            console.warn("Failed to append Attempt Event", {
              attemptId: args.attemptId,
              error,
            });
          }
        },
      );
      if (outcome.kind === "retry") {
        await ctx.scheduler.runAfter(OPENCODE_MONITOR_RETRY_DELAY_MS, internal.integrations.opencode.monitorOpencodeStream, {
          attemptId: args.attemptId,
        });
        return null;
      }

      const resolved = await resolveOpencodeOutcome(sandbox, todo, outcome);
      await ctx.runMutation(internal.todoRuns.finish, {
        attemptId: args.attemptId,
        streamState: outcome.terminalState,
        terminalAt: outcome.terminalAt,
        terminalReason: resolved.terminalReason,
        todoStatus: resolved.todoStatus,
        prUrl: resolved.prUrl,
      });
      if (resolved.prUrl) {
        await ctx.scheduler.runAfter(0, internal.integrations.notifications.sendDiscordWebhook, {
          content: `Pull request created for todo "${todo.title}": ${resolved.prUrl}`,
          context: { todoId: todo._id, attemptId: args.attemptId, sandboxId: attempt.sandboxId, prUrl: resolved.prUrl },
        });
      }
      await stopSandboxSafely({ todoId: todo._id, attemptId: args.attemptId, sandboxId: attempt.sandboxId, sandbox });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      await ctx.runMutation(internal.todoRuns.failOrchestration, { attemptId: args.attemptId, reason });
      await stopSandboxSafely({ todoId: todo._id, attemptId: args.attemptId, sandboxId: attempt.sandboxId, sandbox });
      throw error;
    }
    return null;
  },
});

type ResolvedOpencodeOutcome = {
  todoStatus: "COMPLETED" | "FAILED";
  terminalReason: string | undefined;
  prUrl: string | undefined;
};

async function resolveOpencodeOutcome(
  sandbox: Sandbox,
  todo: { title: string; description?: string; githubUrl?: string },
  terminal: TerminalResult,
): Promise<ResolvedOpencodeOutcome> {
  if (terminal.terminalState !== "COMPLETED") {
    return { todoStatus: "FAILED", terminalReason: terminal.terminalReason, prUrl: undefined };
  }
  try {
    const result = await createPullRequest(sandbox, {
      title: todo.title,
      description: todo.description,
      repoUrl: todo.githubUrl,
    });
    return { todoStatus: "COMPLETED", terminalReason: terminal.terminalReason, prUrl: result.kind === "noChanges" ? undefined : result.prUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { todoStatus: "FAILED", terminalReason: `Post-run PR creation failed: ${message}`, prUrl: undefined };
  }
}
