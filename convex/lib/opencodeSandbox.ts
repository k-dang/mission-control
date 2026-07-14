"use node";

import { createOpencodeClient } from "@opencode-ai/sdk/v2";
import type { Sandbox } from "@vercel/sandbox";
import type { Id } from "../_generated/dataModel";
import {
  buildOpencodeConfig,
  getOpencodeMainModel,
  OPENCODE_BIN,
  OPENCODE_CONFIG_PATH,
  OPENCODE_PORT,
  OPENCODE_VERSION,
  readOpencodeConfigApiKeys,
} from "./opencodeConfig";
import { waitForOpencodeHealth } from "./opencodeHealth";
import type { RunConfiguration } from "./runConfiguration";
import { buildTodoPrompt } from "./todoPrompt";

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

export async function writeOpencodeConfig(
  sandbox: Sandbox,
  runConfiguration: RunConfiguration,
) {
  const selectedModel = getOpencodeMainModel(runConfiguration);
  const opencodeConfig = JSON.stringify(
    buildOpencodeConfig(
      selectedModel,
      readOpencodeConfigApiKeys(selectedModel.providerID),
    ),
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

export async function startOpencodeServer(sandbox: Sandbox) {
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
    runConfiguration: RunConfiguration;
  },
) {
  console.info("Installing OpenCode", { todoId: args.todoId });
  const cliVersion = await installOpencode(sandbox);

  await writeOpencodeConfig(sandbox, args.runConfiguration);
  const selectedModel = getOpencodeMainModel(args.runConfiguration);

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
    model: selectedModel,
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
