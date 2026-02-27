import { v } from "convex/values";
import { internalAction } from "./_generated/server";

const statusValidator = v.union(
  v.literal("TODO"),
  v.literal("INPROGRESS"),
  v.literal("COMPLETED"),
);

export const logTodoStatusTransition = internalAction({
  args: {
    todoId: v.id("todos"),
    fromStatus: statusValidator,
    toStatus: statusValidator,
    timestampMs: v.number(),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn(
        "DISCORD_WEBHOOK_URL is not configured; skipping todo status webhook",
        args,
      );
      return null;
    }

    const timestampIso = new Date(args.timestampMs).toISOString();
    const content = `Todo ${args.todoId} moved ${args.fromStatus} -> ${args.toStatus} at ${timestampIso}`;

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        const responseBody = await response.text();
        console.error("Discord webhook request failed", {
          status: response.status,
          statusText: response.statusText,
          responseBody: responseBody.slice(0, 500),
          ...args,
        });
      }
    } catch (error) {
      console.error("Discord webhook request threw an error", {
        error: error instanceof Error ? error.message : String(error),
        ...args,
      });
    }

    return null;
  },
});
