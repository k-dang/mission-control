"use node";

import { Sandbox } from "@vercel/sandbox";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

export const spawnSandboxForTodo = internalAction({
  args: {
    todoId: v.id("todos"),
    githubUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sandbox = await Sandbox.create({
      source: { type: "git", url: args.githubUrl },
      ports: [3000],
      runtime: "node24",
      teamId: process.env.VERCEL_TEAM_ID,
      projectId: process.env.VERCEL_PROJECT_ID,
      token: process.env.VERCEL_TOKEN,
    });

    const sandboxUrl = sandbox.domain(3000);

    await ctx.runMutation(internal.myFunctions.saveSandboxResult, {
      todoId: args.todoId,
      sandboxId: sandbox.sandboxId,
      sandboxUrl,
    });

    return null;
  },
});
