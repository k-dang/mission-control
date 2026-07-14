"use node";

import type { Command, Sandbox } from "@vercel/sandbox";
import { PI_BIN, PI_PACKAGE_NAME, PI_VERSION, buildPiModelReference, resolvePiProviderApiKey } from "./piConfig";
import { SANDBOX_REPO_PATH } from "./sandboxHelpers";
import type { RunConfiguration } from "./runConfiguration";
import { buildTodoPrompt } from "./todoPrompt";

export async function installPi(sandbox: Sandbox) {
  const install = await sandbox.runCommand({
    cmd: "npm",
    args: [
      "install",
      "-g",
      "--ignore-scripts",
      `${PI_PACKAGE_NAME}@${PI_VERSION}`,
    ],
  });
  if (install.exitCode !== 0) {
    const installOut = (await install.output()).toString().trim();
    throw new Error(
      `Pi install failed (exit ${install.exitCode})${installOut ? `: ${installOut.slice(0, 2000)}` : ""}`,
    );
  }

  const version = await sandbox.runCommand(PI_BIN, ["--version"]);
  const versionText = (await version.output()).toString().trim();
  console.log("Pi version:", versionText);
  return versionText;
}

/**
 * The returned `Command`'s id becomes the Attempt's opaque Harness Run ID;
 * the caller is responsible for recording it and scheduling monitoring.
 */
export async function startPiHarnessCommand(
  sandbox: Sandbox,
  args: {
    todo: { title: string; description?: string; githubUrl?: string };
    /** Correlation id for logging only (an Attempt's Todo Task id in production, an arbitrary label for dev smokes). */
    todoId: string;
    runConfiguration: RunConfiguration;
  },
): Promise<Command> {
  const { envVar, apiKey } = resolvePiProviderApiKey(args.runConfiguration.providerId);
  const modelReference = buildPiModelReference(args.runConfiguration);
  const prompt = buildTodoPrompt(
    args.todo.title,
    args.todo.description,
    args.todo.githubUrl,
  );

  console.info("Starting Pi", { todoId: args.todoId, model: modelReference });
  return sandbox.runCommand({
    cmd: PI_BIN,
    args: ["--mode", "json", "--no-session", "--approve", "--model", modelReference, prompt],
    cwd: SANDBOX_REPO_PATH,
    env: { [envVar]: apiKey },
    detached: true,
  });
}
