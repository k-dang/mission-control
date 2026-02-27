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
    const todo = await ctx.runQuery(internal.todos.getById, {
      todoId: args.todoId,
    });
    if (!todo) {
      console.warn("Todo not found, skipping sandbox creation", {
        todoId: args.todoId,
      });
      return null;
    }
    if (todo.sandboxId) {
      console.info("Sandbox already exists for todo, skipping creation", {
        todoId: args.todoId,
        sandboxId: todo.sandboxId,
      });
      return null;
    }
    const sandbox = await Sandbox.create({
      source: { type: "git", url: args.githubUrl },
      ports: [3000],
      runtime: "node24",
      timeout: 5 * 60 * 1000,
      teamId: process.env.VERCEL_TEAM_ID,
      projectId: process.env.VERCEL_PROJECT_ID,
      token: process.env.VERCEL_TOKEN,
    });

    const todoPayload = JSON.stringify({
      _id: todo._id,
      title: todo.title,
      description: todo.description,
      status: todo.status,
      githubUrl: todo.githubUrl,
    });
    await sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", "echo \"$TODO_PAYLOAD\""],
      env: { TODO_PAYLOAD: todoPayload },
    });

    const sandboxUrl = sandbox.domain(3000);

    await ctx.runMutation(internal.sandboxStorage.saveSandboxResult, {
      todoId: args.todoId,
      sandboxId: sandbox.sandboxId,
      sandboxUrl,
    });

    return null;
  },
});
