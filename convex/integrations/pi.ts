"use node";

import type { Sandbox } from "@vercel/sandbox";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { createPullRequest } from "../lib/pullRequest";
import { parseRunConfiguration } from "../lib/runConfiguration";
import {
  decideAttemptLifetime,
  resolveMaxAttemptDurationMs,
} from "../lib/attemptLifetime";
import { installPi, startPiHarnessCommand } from "../lib/piSandbox";
import {
  failPiAttemptForBudgetExhaustion,
  PI_MONITOR_SLICE_MS,
  type PiTerminalResult,
  waitForPiTerminalState,
} from "../lib/piStreamMonitor";
import { getSandbox, stopSandboxSafely } from "../lib/sandboxHelpers";

const PI_MONITOR_RETRY_DELAY_MS = 1_000;

export const runTodo = internalAction({
  args: { todoId: v.id("todos"), attemptId: v.id("todoAttempts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [todo, attempt] = await Promise.all([
      ctx.runQuery(internal.todos.getById, { todoId: args.todoId }),
      ctx.runQuery(internal.todoAttempts.getRunnableById, { attemptId: args.attemptId }),
    ]);
    if (!todo || !attempt || attempt.todoId !== args.todoId || !attempt.sandboxId) {
      return null;
    }

    let sandbox: Sandbox | undefined;
    try {
      if (!attempt.runConfiguration) throw new Error("Run configuration missing for Attempt");
      const runConfiguration = parseRunConfiguration(attempt.runConfiguration);
      if (!runConfiguration.ok) throw new Error(runConfiguration.error);
      sandbox = await getSandbox(attempt.sandboxId);
      await installPi(sandbox);
      const command = await startPiHarnessCommand(sandbox, {
        todo,
        todoId: args.todoId,
        runConfiguration: runConfiguration.value,
      });
      const startedAt = Date.now();
      const recorded = await ctx.runMutation(internal.todoRuns.recordPiStarted, {
        attemptId: args.attemptId,
        commandId: command.cmdId,
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
      await ctx.scheduler.runAfter(0, internal.integrations.pi.monitorPiStream, {
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

export const monitorPiStream = internalAction({
  args: { attemptId: v.id("todoAttempts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const attempt = await ctx.runQuery(internal.todoAttempts.getRunnableById, { attemptId: args.attemptId });
    if (!attempt?.sandboxId || !attempt.harnessRunId) {
      return null;
    }
    const todo = await ctx.runQuery(internal.todos.getById, { todoId: attempt.todoId });
    if (!todo) return null;
    let sandbox: Sandbox | undefined;

    try {
      sandbox = await getSandbox(attempt.sandboxId);
      const command = await sandbox.getCommand(attempt.harnessRunId);
      const maxAttemptDurationMs = resolveMaxAttemptDurationMs(process.env.MAX_ATTEMPT_DURATION_MS);
      const lifetime = decideAttemptLifetime({
        // The 30-minute lifetime covers provisioning and Pi install too, not
        // merely the time after the harness command starts streaming.
        startedAt: attempt._creationTime,
        now: Date.now(),
        maxAttemptDurationMs,
        sandboxDeadlineAt: sandbox.createdAt.getTime() + sandbox.timeout,
        monitorSliceMs: PI_MONITOR_SLICE_MS,
      });
      if (lifetime.kind === "timedOut") {
        const terminal = await failPiAttemptForBudgetExhaustion(command, todo._id, maxAttemptDurationMs);
        await ctx.runMutation(internal.todoRuns.failOrchestration, {
          attemptId: args.attemptId,
          reason: terminal.terminalReason ?? "Attempt exceeded the maximum duration",
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

      let outcome = await waitForPiTerminalState(
        command,
        todo._id,
        async (event) => {
          await ctx.runMutation(internal.todoEvents.append, {
            todoId: todo._id,
            attemptId: args.attemptId,
            eventKey: event.eventKey,
            event: event.event,
          });
        },
        lifetime.monitorForMs,
      );
      if (outcome.kind === "retry") {
        await ctx.scheduler.runAfter(PI_MONITOR_RETRY_DELAY_MS, internal.integrations.pi.monitorPiStream, {
          attemptId: args.attemptId,
        });
        return null;
      }
      if (outcome.terminalAt >= lifetime.attemptDeadlineAt) {
        const terminal = await failPiAttemptForBudgetExhaustion(
          command,
          todo._id,
          maxAttemptDurationMs,
        );
        outcome = { kind: "terminal", ...terminal };
      }

      const resolved = await resolvePiOutcome(sandbox, todo, outcome);
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

type ResolvedPiOutcome = {
  todoStatus: "COMPLETED" | "FAILED";
  terminalReason: string | undefined;
  prUrl: string | undefined;
};

async function resolvePiOutcome(
  sandbox: Sandbox,
  todo: { title: string; description?: string; githubUrl?: string },
  terminal: PiTerminalResult,
): Promise<ResolvedPiOutcome> {
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
