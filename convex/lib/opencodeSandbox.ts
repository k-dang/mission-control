"use node";

import { createOpencodeClient } from "@opencode-ai/sdk/v2";
import type { Sandbox } from "@vercel/sandbox";
import type { Id } from "../_generated/dataModel";
import {
  DEFAULT_VERCEL_MODEL,
  DEFAULT_VERCEL_SMALL_MODEL,
  OPENCODE_BIN,
  OPENCODE_CONFIG_PATH,
  OPENCODE_PORT,
  OPENCODE_PROVIDER_ID,
  OPENCODE_VERSION,
} from "./opencodeConfig";
import { waitForOpencodeHealth } from "./opencodeHealth";

function readAiGatewayApiKey(): string {
  const key = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "AI_GATEWAY_API_KEY is required for OpenCode with Vercel AI Gateway (set in Convex env)",
    );
  }
  return key;
}

export async function installOpencode(sandbox: Sandbox) {
  const install = await sandbox.runCommand({
    cmd: "bash",
    args: [
      "-c",
      `curl -fsSL https://opencode.ai/install | bash -s -- --version ${OPENCODE_VERSION}`,
    ],
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
  return versionText;
}

function buildTodoPrompt(
  title: string,
  description?: string,
  githubUrl?: string,
) {
  const lines = ["Task:", title.trim()];

  const trimmedDescription = description?.trim();
  if (trimmedDescription) {
    lines.push("", "Additional context:", trimmedDescription);
  }

  if (githubUrl?.trim()) {
    lines.push("", "Repository:", githubUrl.trim());
  }

  lines.push(
    "",
    "Expected workflow:",
    "1. Understand the codebase before editing.",
    "2. Make the code changes needed to complete the task.",
    "3. Run the most relevant validation for the files you change.",
  );

  return lines.join("\n");
}

async function writeOpencodeConfig(sandbox: Sandbox) {
  const apiKey = readAiGatewayApiKey();
  const opencodeConfig = JSON.stringify(
    {
      $schema: "https://opencode.ai/config.json",
      enabled_providers: ["vercel"],
      provider: {
        vercel: {
          options: { apiKey },
          models: {
            [DEFAULT_VERCEL_MODEL]: {},
            [DEFAULT_VERCEL_SMALL_MODEL]: {},
          },
        },
      },
      model: DEFAULT_VERCEL_MODEL,
      small_model: DEFAULT_VERCEL_SMALL_MODEL,
    },
    null,
    2,
  );
  await sandbox.writeFiles([
    {
      path: OPENCODE_CONFIG_PATH,
      content: Buffer.from(opencodeConfig, "utf8"),
    },
  ]);
}

async function startOpencodeServer(sandbox: Sandbox) {
  await sandbox.runCommand({
    cmd: OPENCODE_BIN,
    args: ["serve", "--hostname", "0.0.0.0", "--port", `${OPENCODE_PORT}`],
    detached: true,
  });

  const publicUrl = sandbox.domain(OPENCODE_PORT);
  const client = createOpencodeClient({ baseUrl: publicUrl });
  return { publicUrl, client };
}

export async function setupOpencodeForTodo(
  sandbox: Sandbox,
  args: {
    todo: {
      title: string;
      description?: string;
      githubUrl?: string;
    };
    todoId: Id<"todos">;
  },
) {
  console.info("Installing OpenCode", { todoId: args.todoId });
  const cliVersion = await installOpencode(sandbox);

  await writeOpencodeConfig(sandbox);

  console.info("Starting OpenCode server", { todoId: args.todoId });
  const { publicUrl, client } = await startOpencodeServer(sandbox);

  const health = await waitForOpencodeHealth(client);
  const session = await client.session.create({
    title: args.todo.title,
  });
  if (session.error || !session.data) {
    throw new Error(
      `Failed to create OpenCode session: ${session.error?.data.message ?? "missing session data"}`,
    );
  }

  console.info("OpenCode ready", {
    todoId: args.todoId,
    cliVersion,
    health,
    url: publicUrl,
  });

  const prompt = await client.session.promptAsync({
    sessionID: session.data.id,
    model: {
      providerID: OPENCODE_PROVIDER_ID,
      modelID: DEFAULT_VERCEL_MODEL,
    },
    parts: [
      {
        type: "text",
        text: buildTodoPrompt(
          args.todo.title,
          args.todo.description,
          args.todo.githubUrl,
        ),
      },
    ],
  });
  if (prompt.error) {
    throw new Error(
      `Failed to submit OpenCode prompt: ${prompt.error.data.message}`,
    );
  }

  return {
    publicUrl,
    sessionId: session.data.id,
    cliVersion,
    health,
  };
}
