"use node";

import { Sandbox } from "@vercel/sandbox";
import { createOpencodeClient } from "@opencode-ai/sdk/client";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const OPENCODE_PORT = 4096;
/** Upstream mounts health at `/global/health` (see GlobalRoutes in opencode server). */
const OPENCODE_HEALTH_PATH = "/global/health";
const OPENCODE_SERVE_LOG = "/tmp/opencode-serve.log";
const HEALTH_CHECK_ATTEMPTS = 5;
const HEALTH_CHECK_INTERVAL_MS = 2000;

async function readOpencodeServeLogTail(sandbox: Sandbox, maxChars = 16_000): Promise<string> {
  const result = await sandbox.runCommand({
    cmd: "bash",
    args: [
      "-lc",
      `tail -c ${maxChars} "${OPENCODE_SERVE_LOG}" 2>&1 || true`,
    ],
  });
  const buf = await result.output();
  return buf.toString().trim();
}

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildPrompt(todo: {
  title: string;
  description?: string;
  githubUrl?: string;
}) {
  const slug = slugifyTitle(todo.title);
  return `You are working on a codebase cloned from ${todo.githubUrl}.

Task: ${todo.title}
${todo.description ?? ""}

Instructions:
1. Understand the codebase structure and implement the changes described above.
2. Do NOT run git commands, push, or create pull requests. Another system will open the PR.
3. When you are done, output exactly one line (no markdown fences, no extra text before or after):
PR_DETAILS_JSON:{"title":"<short PR title>","body":"<PR description in plain text or use \\n for newlines>","branch":"opencode/${slug}"}
You may change "title" and "body" to summarize the work. "branch" is optional; if omitted, use "opencode/${slug}" as the branch prefix hint. Escape any double quotes inside strings as \\".
`;
}

type PrDetails = { title: string; body: string; branch: string | null };

function extractPrDetailsFromAssistantText(
  combinedText: string,
  fallback: { title: string; description?: string },
): PrDetails {
  const marker = "PR_DETAILS_JSON:";
  const idx = combinedText.lastIndexOf(marker);
  if (idx >= 0) {
    const raw = combinedText.slice(idx + marker.length).trim();
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        const parsed = JSON.parse(
          raw.slice(firstBrace, lastBrace + 1),
        ) as Record<string, unknown>;
        const title =
          typeof parsed.title === "string" ? parsed.title.trim() : "";
        const body = typeof parsed.body === "string" ? parsed.body : "";
        const branch =
          typeof parsed.branch === "string" ? parsed.branch.trim() : null;
        if (title.length > 0) {
          return { title, body, branch: branch || null };
        }
      } catch {
        // fall through to defaults
      }
    }
  }
  const slug = slugifyTitle(fallback.title) || "task";
  const defaultBody = [fallback.title, fallback.description]
    .filter(Boolean)
    .join("\n\n");
  return {
    title:
      fallback.title.length > 72
        ? `${fallback.title.slice(0, 69)}...`
        : fallback.title,
    body: defaultBody,
    branch: `opencode/${slug}`,
  };
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const GIT_ADD_EXCLUDES = [
  ".",
  ":!*.tar",
  ":!*.tar.gz",
  ":!*.tar.bz2",
  ":!*.tar.xz",
  ":!*.tgz",
  ":!*.tbz",
  ":!*.tbz2",
  ":!*.txz",
];

async function createPR(
  sandbox: Sandbox,
  repoUrl: string,
  prDetails: PrDetails,
): Promise<
  | { success: true; branch: string; prUrl: string; prNumber: number }
  | { error: string }
> {
  try {
    if (!process.env.GITHUB_TOKEN) {
      throw new Error("GITHUB_TOKEN environment variable is required");
    }

    const { title, body, branch } = prDetails;
    console.log(
      `Creating PR with title: ${title}, body length: ${body.length}, branch hint: ${branch}`,
    );

    const branchName = `${branch || "feature/ai-changes"}-${Date.now()}`;
    const commitSubject = title.split("\n")[0]!.slice(0, 200);

    await sandbox.runCommand({
      cmd: "git",
      args: ["config", "user.email", "ai-agent@example.com"],
    });
    await sandbox.runCommand({
      cmd: "git",
      args: ["config", "user.name", "AI Coding Agent"],
    });

    const authUrl = repoUrl.replace(
      "https://github.com/",
      `https://${process.env.GITHUB_TOKEN}@github.com/`,
    );
    await sandbox.runCommand({
      cmd: "git",
      args: ["remote", "set-url", "origin", authUrl],
    });

    await sandbox.runCommand({
      cmd: "git",
      args: ["checkout", "-b", branchName],
    });
    await sandbox.runCommand({
      cmd: "git",
      args: ["add", ...GIT_ADD_EXCLUDES],
    });

    const diffResult = await sandbox.runCommand({
      cmd: "git",
      args: ["diff", "--cached", "--name-only"],
    });
    const diffOutput = await diffResult.output();

    if (!diffOutput.toString().trim()) {
      const timestamp = new Date().toISOString();
      await sandbox.runCommand({
        cmd: "bash",
        args: [
          "-c",
          `echo "AI Agent Activity: ${timestamp}" > .ai-activity.md`,
        ],
      });
      await sandbox.runCommand({
        cmd: "git",
        args: ["add", ...GIT_ADD_EXCLUDES],
      });
    }

    await sandbox.runCommand({
      cmd: "git",
      args: ["commit", "-m", commitSubject],
    });
    await sandbox.runCommand({
      cmd: "git",
      args: ["push", "-u", "origin", branchName],
    });

    const urlMatch = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (!urlMatch) throw new Error("Invalid GitHub repository URL");

    const [, owner, repo] = urlMatch;
    const prData = { title, body, head: branchName, base: "main" };

    const response = await sandbox.runCommand({
      cmd: "curl",
      args: [
        "-s",
        "-X",
        "POST",
        "-H",
        `Authorization: token ${process.env.GITHUB_TOKEN}`,
        "-H",
        "Accept: application/vnd.github.v3+json",
        "-H",
        "Content-Type: application/json",
        "-d",
        JSON.stringify(prData),
        `https://api.github.com/repos/${owner}/${repo}/pulls`,
      ],
    });

    const result = JSON.parse((await response.output()).toString()) as {
      html_url?: string;
      number?: number;
      message?: string;
    };

    if (result.html_url && typeof result.number === "number") {
      return {
        success: true,
        branch: branchName,
        prUrl: result.html_url,
        prNumber: result.number,
      };
    }
    throw new Error(result.message || "Failed to create PR");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    return { error: message };
  }
}

export const runOpencodeForTodo = internalAction({
  args: {
    todoId: v.id("todos"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const todo = await ctx.runQuery(internal.todos.getById, {
      todoId: args.todoId,
    });
    if (!todo || !todo.sandboxId) {
      console.warn("Todo or sandbox not found, skipping opencode", {
        todoId: args.todoId,
      });
      return null;
    }

    const sandboxId = todo.sandboxId;

    try {
      const sandbox = await Sandbox.get({
        sandboxId: todo.sandboxId,
        token: process.env.VERCEL_TOKEN,
        teamId: process.env.VERCEL_TEAM_ID,
        projectId: process.env.VERCEL_PROJECT_ID,
      });

      // Install opencode
      console.info("Installing opencode in sandbox", {
        todoId: args.todoId,
      });
      await sandbox.runCommand({
        cmd: "bash",
        args: ["-lc", "npm install -g opencode@latest"],
      });

      // Start opencode server
      console.info("Starting opencode server", { todoId: args.todoId });

      await sandbox.runCommand({
        cmd: "bash",
        args: [
          "-lc",
          `rm -f "${OPENCODE_SERVE_LOG}" && nohup opencode serve --hostname 0.0.0.0 --port ${OPENCODE_PORT} >> "${OPENCODE_SERVE_LOG}" 2>&1 &`,
        ],
      });

      // Wait for server to be ready
      const baseUrl = `https://${sandbox.domain(OPENCODE_PORT)}`;
      let serverReady = false;
      for (let i = 0; i < HEALTH_CHECK_ATTEMPTS; i++) {
        await sleep(HEALTH_CHECK_INTERVAL_MS);
        try {
          const res = await fetch(`${baseUrl}${OPENCODE_HEALTH_PATH}`);
          if (res.ok) {
            serverReady = true;
            break;
          }
        } catch {
          // Server not ready yet
        }
      }

      if (!serverReady) {
        const logTail = await readOpencodeServeLogTail(sandbox);
        const suffix =
          logTail.length > 0
            ? ` Last opencode serve output (tail):\n${logTail}`
            : " No opencode serve log captured (file empty or missing).";
        throw new Error(
          `OpenCode server failed to start within health check timeout.${suffix}`,
        );
      }

      // Connect SDK client and run prompt
      const client = createOpencodeClient({ baseUrl });

      const session = await client.session.create({
        body: { title: todo.title },
      });
      const sessionID = session.data?.id;
      if (!sessionID) {
        throw new Error("Failed to create opencode session");
      }

      console.info("Sending prompt to opencode", { todoId: args.todoId });
      const prompt = buildPrompt(todo);
      await client.session.prompt({
        path: { id: sessionID },
        body: {
          parts: [{ type: "text", text: prompt }],
        },
      });

      const messagesRes = await client.session.messages({
        path: { id: sessionID },
      });
      let combinedAssistantText = "";
      for (const entry of messagesRes.data ?? []) {
        if (entry.info.role === "assistant" && entry.parts) {
          for (const part of entry.parts) {
            if (part.type === "text" && "text" in part) {
              combinedAssistantText += part.text;
            }
          }
        }
      }

      const prDetails = extractPrDetailsFromAssistantText(
        combinedAssistantText,
        { title: todo.title, description: todo.description },
      );

      if (!todo.githubUrl) {
        throw new Error("No githubUrl on todo, cannot create PR");
      }

      const prResult = await createPR(sandbox, todo.githubUrl, prDetails);
      if ("error" in prResult) {
        console.error("createPR failed for todo", {
          todoId: args.todoId,
          error: prResult.error,
        });
        throw new Error(prResult.error);
      }

      await ctx.runMutation(internal.sandboxStorage.savePrUrl, {
        todoId: args.todoId,
        prUrl: prResult.prUrl,
      });

      console.info("OpenCode completed for todo", {
        todoId: args.todoId,
        prUrl: prResult.prUrl,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      await ctx.runMutation(internal.sandboxStorage.markFailed, {
        todoId: args.todoId,
        error: message,
      });
      await ctx.runAction(internal.sandbox.shutdownSandboxForTodo, {
        todoId: args.todoId,
        sandboxId,
      });
      throw error;
    }

    return null;
  },
});
