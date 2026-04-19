"use node";

import { Sandbox } from "@vercel/sandbox";

export const SANDBOX_REPO_PATH = "/vercel/sandbox";

type SandboxAccessConfig = {
  projectId: string;
  teamId: string;
  token: string;
};

export function requireSandboxAccessConfig(): SandboxAccessConfig {
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const token = process.env.VERCEL_TOKEN;
  if (!teamId || !projectId || !token) {
    throw new Error("Missing required Vercel sandbox environment variables");
  }
  return { projectId, teamId, token };
}

export async function getSandbox(sandboxId: string) {
  return Sandbox.get({
    sandboxId,
    ...requireSandboxAccessConfig(),
  });
}

export async function configureGitIdentity(
  sandbox: Sandbox,
  gitUserName: string,
  gitUserEmail: string,
) {
  const nameResult = await sandbox.runCommand({
    cmd: "git",
    args: ["config", "user.name", gitUserName],
    cwd: SANDBOX_REPO_PATH,
  });
  if (nameResult.exitCode !== 0) {
    const output = (await nameResult.output()).toString().trim();
    throw new Error(
      `Failed to configure sandbox git user.name (exit ${nameResult.exitCode})${output ? `: ${output.slice(0, 2000)}` : ""}`,
    );
  }

  const emailResult = await sandbox.runCommand({
    cmd: "git",
    args: ["config", "user.email", gitUserEmail],
    cwd: SANDBOX_REPO_PATH,
  });
  if (emailResult.exitCode !== 0) {
    const output = (await emailResult.output()).toString().trim();
    throw new Error(
      `Failed to configure sandbox git user.email (exit ${emailResult.exitCode})${output ? `: ${output.slice(0, 2000)}` : ""}`,
    );
  }
}
