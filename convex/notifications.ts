import { v } from "convex/values";
import { internalAction } from "./_generated/server";

export const sendDiscordWebhook = internalAction({
  args: {
    content: v.string(),
    context: v.optional(v.record(v.string(), v.string())),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn(
        "DISCORD_WEBHOOK_URL is not configured; skipping Discord webhook",
        args.context,
      );
      return null;
    }

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: args.content }),
      });

      if (!response.ok) {
        const responseBody = await response.text();
        console.error("Discord webhook request failed", {
          status: response.status,
          statusText: response.statusText,
          responseBody: responseBody.slice(0, 500),
          context: args.context,
        });
      }
    } catch (error) {
      console.error("Discord webhook request threw an error", {
        error: error instanceof Error ? error.message : String(error),
        context: args.context,
      });
    }

    return null;
  },
});
