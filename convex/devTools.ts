"use node";

import { Buffer } from "node:buffer";
import { createOpencodeClient } from "@opencode-ai/sdk/v2";
import { Sandbox } from "@vercel/sandbox";
import { v } from "convex/values";
import { z } from "zod";
import { action } from "./_generated/server";
import { requireAuthenticated } from "./authHelpers";
import {
  buildOpencodeConfig,
  getOpencodeMainModel,
  OPENCODE_PORT,
  OPENCODE_PROVIDER_API_KEY_ENV,
  OPENCODE_VERSION,
} from "./lib/opencodeConfig";
import {
  installOpencode,
  startOpencodeServer,
  writeOpencodeConfig,
} from "./lib/opencodeSandbox";
import { waitForOpencodeHealth } from "./lib/opencodeHealth";
import { installPi, startPiHarnessCommand } from "./lib/piSandbox";
import { waitForPiTerminalState } from "./lib/piStreamMonitor";
import { buildPiModelReference } from "./lib/piConfig";
import { createPullRequest } from "./lib/pullRequest";
import { parseRunConfiguration } from "./lib/runConfiguration";
import {
  opencodeRunConfigurationProviderIdValidator,
  piRunConfigurationProviderIdValidator,
} from "./lib/todoValidators";
import {
  configureGitIdentity,
  getSandbox,
  requireSandboxAccessConfig,
  SANDBOX_GIT_USER_EMAIL,
  SANDBOX_GIT_USER_NAME,
} from "./lib/sandboxHelpers";

const MISSION_CONTROL = { owner: "k-dang", repo: "mission-control" } as const;
const DEV_TOOLS_DISABLED_ERROR =
  "Dev tools are disabled. Set CONVEX_DEV_TOOLS=true in Convex env to enable them.";

const githubBranchRefSchema = z.object({
  object: z.object({
    sha: z.string(),
  }),
});

const githubErrorSchema = z.object({
  errors: z
    .array(
      z.object({
        message: z.string(),
      }),
    )
    .optional(),
  message: z.string().optional(),
});

const githubPullRequestSchema = z.object({
  html_url: z.string(),
  number: z.number(),
});

const githubRepoSchema = z.object({
  default_branch: z.string(),
});

const githubUserSchema = z.object({
  login: z.string().optional(),
});

function areDevToolsEnabled() {
  return process.env.CONVEX_DEV_TOOLS === "true";
}

function githubHeaders(token: string) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token.trim()}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "convex-todo-app",
  } as const;
}

async function readGithubError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const parsed = githubErrorSchema.safeParse(body);
    if (!parsed.success) {
      return response.statusText;
    }

    const detail = parsed.data.errors
      ?.flatMap((error) => (error.message ? [error.message] : []))
      .join("; ");
    return [parsed.data.message, detail].filter(Boolean).join(" — ") || response.statusText;
  } catch {
    return response.statusText;
  }
}

async function getBranchHeadCommitSha(
  owner: string,
  repo: string,
  branch: string,
  headers: ReturnType<typeof githubHeaders>,
): Promise<string | null> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    { headers },
  );
  if (!res.ok) {
    return null;
  }
  const data = await res.json();
  const parsed = githubBranchRefSchema.safeParse(data);
  return parsed.success ? parsed.data.object.sha : null;
}

export const checkGithubToken = action({
  args: {},
  returns: v.object({
    configured: v.boolean(),
    authenticated: v.boolean(),
    login: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
  }),
  handler: async () => {
    if (!areDevToolsEnabled()) {
      return {
        configured: false,
        authenticated: false,
        login: null,
        error: DEV_TOOLS_DISABLED_ERROR,
      };
    }

    const token = process.env.GITHUB_TOKEN;

    if (!token?.trim()) {
      return {
        configured: false,
        authenticated: false,
        login: null,
        error: "GITHUB_TOKEN is not set in Convex environment variables.",
      };
    }

    try {
      const response = await fetch("https://api.github.com/user", {
        headers: githubHeaders(token),
      });

      if (response.status === 200) {
        const body = await response.json();
        const parsed = githubUserSchema.safeParse(body);
        return {
          configured: true,
          authenticated: true,
          login: parsed.success ? (parsed.data.login ?? null) : null,
          error: null,
        };
      }

      if (response.status === 401) {
        return {
          configured: true,
          authenticated: false,
          login: null,
          error: "Token is set but invalid or expired (401 Unauthorized).",
        };
      }

      return {
        configured: true,
        authenticated: false,
        login: null,
        error: `GitHub API returned unexpected status ${response.status}.`,
      };
    } catch (err) {
      return {
        configured: true,
        authenticated: false,
        login: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

export const checkOpencodeInstall = action({
  args: {},
  returns: v.object({
    ok: v.boolean(),
    expectedVersion: v.string(),
    installedVersion: v.union(v.string(), v.null()),
    sandboxId: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
  }),
  handler: async () => {
    if (!areDevToolsEnabled()) {
      console.warn("OpenCode install check skipped", {
        error: DEV_TOOLS_DISABLED_ERROR,
      });
      return {
        ok: false,
        expectedVersion: OPENCODE_VERSION,
        installedVersion: null,
        sandboxId: null,
        error: DEV_TOOLS_DISABLED_ERROR,
      };
    }

    let sandbox: Sandbox | undefined;
    try {
      sandbox = await Sandbox.create({
        ...requireSandboxAccessConfig(),
        ports: [OPENCODE_PORT],
        runtime: "node24",
        timeout: 10 * 60 * 1000,
      });

      const installedVersion = await installOpencode(sandbox);

      console.info("OpenCode install check succeeded", {
        expectedVersion: OPENCODE_VERSION,
        installedVersion,
        sandboxId: sandbox.sandboxId,
      });

      if (installedVersion !== OPENCODE_VERSION) {
        console.warn("Pinned OpenCode version mismatch", {
          expectedVersion: OPENCODE_VERSION,
          installedVersion,
          sandboxId: sandbox.sandboxId,
        });
      }

      return {
        ok: true,
        expectedVersion: OPENCODE_VERSION,
        installedVersion,
        sandboxId: sandbox.sandboxId,
        error:
          installedVersion === OPENCODE_VERSION
            ? null
            : `Installed OpenCode ${installedVersion}, expected ${OPENCODE_VERSION}`,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error("OpenCode install check failed", {
        expectedVersion: OPENCODE_VERSION,
        sandboxId: sandbox?.sandboxId,
        error,
      });
      return {
        ok: false,
        expectedVersion: OPENCODE_VERSION,
        installedVersion: null,
        sandboxId: sandbox?.sandboxId ?? null,
        error,
      };
    } finally {
      if (sandbox) {
        try {
          await sandbox.stop();
        } catch (err) {
          console.warn("Failed to stop OpenCode install-check sandbox", {
            sandboxId: sandbox.sandboxId,
            error: err,
          });
        }
      }
    }
  },
});

const devRunConfigurations = {
  vercel: {
    providerId: "vercel",
    modelId: "moonshotai/kimi-k2.5",
  },
  openrouter: {
    providerId: "openrouter",
    modelId: "moonshotai/kimi-k2.6:free",
  },
  opencode: {
    providerId: "opencode",
    modelId: "deepseek-v4-flash-free",
  },
} as const;

export const checkRunConfiguration = action({
  args: {
    providerId: opencodeRunConfigurationProviderIdValidator,
  },
  returns: v.object({
    ok: v.boolean(),
    providerId: v.string(),
    modelId: v.string(),
    opencodeModel: v.union(v.string(), v.null()),
    enabledProviders: v.array(v.string()),
    error: v.union(v.string(), v.null()),
  }),
  handler: async (_, args) => {
    const runConfiguration = devRunConfigurations[args.providerId];
    const { providerId, modelId } = runConfiguration;

    if (!areDevToolsEnabled()) {
      return {
        ok: false,
        providerId,
        modelId,
        opencodeModel: null,
        enabledProviders: [],
        error: DEV_TOOLS_DISABLED_ERROR,
      };
    }

    const envVar = OPENCODE_PROVIDER_API_KEY_ENV[providerId];
    const apiKey = process.env[envVar]?.trim();
    if (!apiKey) {
      return {
        ok: false,
        providerId,
        modelId,
        opencodeModel: null,
        enabledProviders: [],
        error: `${envVar} is not set in Convex environment variables.`,
      };
    }

    try {
      const parsed = parseRunConfiguration(runConfiguration);
      if (!parsed.ok) {
        return {
          ok: false,
          providerId,
          modelId,
          opencodeModel: null,
          enabledProviders: [],
          error: parsed.error,
        };
      }

      const config = buildOpencodeConfig(
        getOpencodeMainModel(parsed.value),
        {
          selectedProviderID: providerId,
          apiKey,
        },
      );

      return {
        ok: true,
        providerId,
        modelId,
        opencodeModel: config.model,
        enabledProviders: config.enabled_providers,
        error: null,
      };
    } catch (err) {
      return {
        ok: false,
        providerId,
        modelId,
        opencodeModel: null,
        enabledProviders: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

export const startOpencodeSmokeSandbox = action({
  args: {
    providerId: opencodeRunConfigurationProviderIdValidator,
  },
  returns: v.object({
    ok: v.boolean(),
    providerId: v.string(),
    modelId: v.string(),
    opencodeModel: v.union(v.string(), v.null()),
    sandboxId: v.union(v.string(), v.null()),
    opencodeUrl: v.union(v.string(), v.null()),
    sessionId: v.union(v.string(), v.null()),
    installedVersion: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
  }),
  handler: async (_, args) => {
    const runConfiguration = devRunConfigurations[args.providerId];
    const { providerId, modelId } = runConfiguration;

    if (!areDevToolsEnabled()) {
      return {
        ok: false,
        providerId,
        modelId,
        opencodeModel: null,
        sandboxId: null,
        opencodeUrl: null,
        sessionId: null,
        installedVersion: null,
        error: DEV_TOOLS_DISABLED_ERROR,
      };
    }

    let sandbox: Sandbox | undefined;
    try {
      const parsed = parseRunConfiguration(runConfiguration);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }

      const selectedModel = getOpencodeMainModel(parsed.value);
      sandbox = await Sandbox.create({
        ...requireSandboxAccessConfig(),
        ports: [OPENCODE_PORT],
        runtime: "node24",
        timeout: 10 * 60 * 1000,
      });

      const installedVersion = await installOpencode(sandbox);
      await writeOpencodeConfig(sandbox, parsed.value);
      const { publicUrl, client } = await startOpencodeServer(sandbox);
      await waitForOpencodeHealth(client);

      const session = await client.session.create({
        title: `Dev smoke test: ${providerId}/${modelId}`,
      });
      if (session.error || !session.data) {
        throw new Error(
          `Failed to create OpenCode session: ${session.error?.data.message ?? "missing session data"}`,
        );
      }

      return {
        ok: true,
        providerId,
        modelId,
        opencodeModel: `${selectedModel.providerID}/${selectedModel.modelID}`,
        sandboxId: sandbox.sandboxId,
        opencodeUrl: publicUrl,
        sessionId: session.data.id,
        installedVersion,
        error: null,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      if (sandbox) {
        try {
          await sandbox.stop();
        } catch (stopErr) {
          console.warn("Failed to stop failed dev OpenCode smoke sandbox", {
            sandboxId: sandbox.sandboxId,
            error: stopErr,
          });
        }
      }

      return {
        ok: false,
        providerId,
        modelId,
        opencodeModel: null,
        sandboxId: sandbox?.sandboxId ?? null,
        opencodeUrl: null,
        sessionId: null,
        installedVersion: null,
        error,
      };
    }
  },
});

export const sendOpencodeSmokePrompt = action({
  args: {
    providerId: opencodeRunConfigurationProviderIdValidator,
    sandboxId: v.string(),
    opencodeUrl: v.string(),
    sessionId: v.string(),
    prompt: v.string(),
  },
  returns: v.object({
    ok: v.boolean(),
    providerId: v.string(),
    modelId: v.string(),
    sessionId: v.string(),
    error: v.union(v.string(), v.null()),
  }),
  handler: async (_, args) => {
    const runConfiguration = devRunConfigurations[args.providerId];
    const { providerId, modelId } = runConfiguration;

    if (!areDevToolsEnabled()) {
      return {
        ok: false,
        providerId,
        modelId,
        sessionId: args.sessionId,
        error: DEV_TOOLS_DISABLED_ERROR,
      };
    }

    const trimmedPrompt = args.prompt.trim();
    if (!trimmedPrompt) {
      return {
        ok: false,
        providerId,
        modelId,
        sessionId: args.sessionId,
        error: "Enter a test prompt before sending.",
      };
    }

    try {
      // Touch the sandbox first so an expired/stopped sandbox is reported clearly.
      await getSandbox(args.sandboxId);
      const parsed = parseRunConfiguration(runConfiguration);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }

      const selectedModel = getOpencodeMainModel(parsed.value);
      const client = createOpencodeClient({ baseUrl: args.opencodeUrl });
      await waitForOpencodeHealth(client);

      const prompt = await client.session.promptAsync({
        sessionID: args.sessionId,
        model: selectedModel,
        parts: [
          {
            type: "text",
            text: trimmedPrompt,
          },
        ],
      });
      if (prompt.error) {
        throw new Error(
          `Failed to submit OpenCode prompt: ${prompt.error.data.message}`,
        );
      }

      return {
        ok: true,
        providerId,
        modelId,
        sessionId: args.sessionId,
        error: null,
      };
    } catch (err) {
      return {
        ok: false,
        providerId,
        modelId,
        sessionId: args.sessionId,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

export const stopOpencodeSmokeSandbox = action({
  args: {
    sandboxId: v.string(),
  },
  returns: v.object({
    ok: v.boolean(),
    sandboxId: v.string(),
    error: v.union(v.string(), v.null()),
  }),
  handler: async (_, args) => {
    if (!areDevToolsEnabled()) {
      return {
        ok: false,
        sandboxId: args.sandboxId,
        error: DEV_TOOLS_DISABLED_ERROR,
      };
    }

    try {
      const sandbox = await getSandbox(args.sandboxId);
      await sandbox.stop();
      return {
        ok: true,
        sandboxId: args.sandboxId,
        error: null,
      };
    } catch (err) {
      return {
        ok: false,
        sandboxId: args.sandboxId,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

const devPiRunConfigurations = {
  "vercel-ai-gateway": {
    providerId: "vercel-ai-gateway",
    modelId: "moonshotai/kimi-k2.5",
  },
  openrouter: {
    providerId: "openrouter",
    modelId: "cohere/north-mini-code:free",
  },
} as const;

const DEFAULT_PI_SMOKE_GITHUB_URL = `https://github.com/${MISSION_CONTROL.owner}/${MISSION_CONTROL.repo}`;
const PI_SMOKE_TASK_TITLE =
  "Pi dev smoke: add a short NOTES-PI-SMOKE.md summarizing this repo's purpose";
const PI_SMOKE_TASK_DESCRIPTION =
  "This is an automated dev-tools smoke test for the Pi Harness adapter. Add a short NOTES-PI-SMOKE.md file (2-3 sentences) summarizing what this repository is for, then stop.";
const PI_SMOKE_MONITOR_DEADLINE_MS = 5 * 60_000;

/** Authenticated developer smoke against the fixed mission-control repo. Pair with monitorPiSmokeSandbox, then stopOpencodeSmokeSandbox (harness-neutral). */
export const startPiSmokeSandbox = action({
  args: {
    providerId: piRunConfigurationProviderIdValidator,
  },
  returns: v.object({
    ok: v.boolean(),
    providerId: v.string(),
    modelId: v.string(),
    modelReference: v.union(v.string(), v.null()),
    githubUrl: v.string(),
    sandboxId: v.union(v.string(), v.null()),
    commandId: v.union(v.string(), v.null()),
    installedVersion: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    await requireAuthenticated(ctx);
    const runConfigurationInput = devPiRunConfigurations[args.providerId];
    const { providerId, modelId } = runConfigurationInput;
    const githubUrl = DEFAULT_PI_SMOKE_GITHUB_URL;

    if (!areDevToolsEnabled()) {
      return {
        ok: false,
        providerId,
        modelId,
        modelReference: null,
        githubUrl,
        sandboxId: null,
        commandId: null,
        installedVersion: null,
        error: DEV_TOOLS_DISABLED_ERROR,
      };
    }

    let sandbox: Sandbox | undefined;
    try {
      const parsed = parseRunConfiguration({ harnessId: "pi", ...runConfigurationInput });
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }

      const githubToken = process.env.GITHUB_TOKEN;
      if (!githubToken) {
        throw new Error("GITHUB_TOKEN is not set; sandbox git clone will 403 on private repos");
      }

      sandbox = await Sandbox.create({
        ...requireSandboxAccessConfig(),
        source: { type: "git", url: githubUrl },
        runtime: "node24",
        timeout: 10 * 60 * 1000,
        env: { GITHUB_TOKEN: githubToken },
      });
      await configureGitIdentity(sandbox, SANDBOX_GIT_USER_NAME, SANDBOX_GIT_USER_EMAIL);

      const installedVersion = await installPi(sandbox);

      const command = await startPiHarnessCommand(sandbox, {
        todo: {
          title: PI_SMOKE_TASK_TITLE,
          description: PI_SMOKE_TASK_DESCRIPTION,
          githubUrl,
        },
        todoId: "dev-pi-smoke",
        runConfiguration: parsed.value,
      });

      return {
        ok: true,
        providerId,
        modelId,
        modelReference: buildPiModelReference(parsed.value),
        githubUrl,
        sandboxId: sandbox.sandboxId,
        commandId: command.cmdId,
        installedVersion,
        error: null,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      if (sandbox) {
        try {
          await sandbox.stop();
        } catch (stopErr) {
          console.warn("Failed to stop failed dev Pi smoke sandbox", {
            sandboxId: sandbox.sandboxId,
            error: stopErr,
          });
        }
      }

      return {
        ok: false,
        providerId,
        modelId,
        modelReference: null,
        githubUrl,
        sandboxId: sandbox?.sandboxId ?? null,
        commandId: null,
        installedVersion: null,
        error,
      };
    }
  },
});

/** Authenticated monitor for the fixed-repository Pi smoke. Does not stop the Sandbox; call stopOpencodeSmokeSandbox after. */
export const monitorPiSmokeSandbox = action({
  args: {
    sandboxId: v.string(),
    commandId: v.string(),
  },
  returns: v.object({
    ok: v.boolean(),
    terminalState: v.union(v.literal("COMPLETED"), v.literal("FAILED"), v.null()),
    terminalReason: v.union(v.string(), v.null()),
    capturedEventCount: v.number(),
    capturedEventKinds: v.array(v.string()),
    pr: v.union(
      v.object({
        kind: v.literal("created"),
        prUrl: v.string(),
        prNumber: v.number(),
        branchName: v.string(),
      }),
      v.object({ kind: v.literal("noChanges") }),
      v.null(),
    ),
    error: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    await requireAuthenticated(ctx);
    if (!areDevToolsEnabled()) {
      return {
        ok: false,
        terminalState: null,
        terminalReason: null,
        capturedEventCount: 0,
        capturedEventKinds: [],
        pr: null,
        error: DEV_TOOLS_DISABLED_ERROR,
      };
    }

    const capturedEventKinds: string[] = [];
    let capturedEventCount = 0;

    try {
      const sandbox = await getSandbox(args.sandboxId);
      const command = await sandbox.getCommand(args.commandId);

      const deadline = Date.now() + PI_SMOKE_MONITOR_DEADLINE_MS;
      let outcome: Awaited<ReturnType<typeof waitForPiTerminalState>> | undefined;
      while (Date.now() < deadline) {
        outcome = await waitForPiTerminalState(command, "dev_pi_smoke", async (event) => {
          capturedEventCount += 1;
          capturedEventKinds.push(event.event.kind);
        });
        if (outcome.kind === "terminal") break;
      }
      if (!outcome || outcome.kind !== "terminal") {
        throw new Error("Pi dev smoke timed out waiting for a terminal state");
      }

      if (outcome.terminalState !== "COMPLETED") {
        return {
          ok: true,
          terminalState: outcome.terminalState,
          terminalReason: outcome.terminalReason ?? null,
          capturedEventCount,
          capturedEventKinds,
          pr: null,
          error: null,
        };
      }

      const prResult = await createPullRequest(sandbox, {
        title: PI_SMOKE_TASK_TITLE,
        description: PI_SMOKE_TASK_DESCRIPTION,
        repoUrl: DEFAULT_PI_SMOKE_GITHUB_URL,
      });

      return {
        ok: true,
        terminalState: outcome.terminalState,
        terminalReason: outcome.terminalReason ?? null,
        capturedEventCount,
        capturedEventKinds,
        pr:
          prResult.kind === "created"
            ? {
                kind: "created" as const,
                prUrl: prResult.prUrl,
                prNumber: prResult.prNumber,
                branchName: prResult.branchName,
              }
            : { kind: "noChanges" as const },
        error: null,
      };
    } catch (err) {
      return {
        ok: false,
        terminalState: null,
        terminalReason: null,
        capturedEventCount,
        capturedEventKinds,
        pr: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

/** Creates a real PR on k-dang/mission-control to verify the token can push and open PRs. */
export const createMissionControlTestPullRequest = action({
  args: {},
  returns: v.object({
    ok: v.boolean(),
    pullRequestUrl: v.union(v.string(), v.null()),
    pullRequestNumber: v.union(v.number(), v.null()),
    branch: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
  }),
  handler: async () => {
    if (!areDevToolsEnabled()) {
      return {
        ok: false,
        pullRequestUrl: null,
        pullRequestNumber: null,
        branch: null,
        error: DEV_TOOLS_DISABLED_ERROR,
      };
    }

    const token = process.env.GITHUB_TOKEN;

    if (!token?.trim()) {
      return {
        ok: false,
        pullRequestUrl: null,
        pullRequestNumber: null,
        branch: null,
        error: "GITHUB_TOKEN is not set in Convex environment variables.",
      };
    }

    const { owner, repo } = MISSION_CONTROL;
    const headers = githubHeaders(token);

    try {
      const repoRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}`,
        { headers },
      );
      if (!repoRes.ok) {
        return {
          ok: false,
          pullRequestUrl: null,
          pullRequestNumber: null,
          branch: null,
          error: `Could not read repo (${repoRes.status}): ${await readGithubError(repoRes)}`,
        };
      }

      const repoJson = await repoRes.json();
      const repoPayload = githubRepoSchema.safeParse(repoJson);
      const base = repoPayload.success ? repoPayload.data.default_branch : null;
      if (!base) {
        return {
          ok: false,
          pullRequestUrl: null,
          pullRequestNumber: null,
          branch: null,
          error: "GitHub repository response did not include a default branch.",
        };
      }

      const baseSha = await getBranchHeadCommitSha(owner, repo, base, headers);
      if (!baseSha) {
        return {
          ok: false,
          pullRequestUrl: null,
          pullRequestNumber: null,
          branch: null,
          error: `Could not resolve default branch "${base}" to a commit (empty repo or missing ref).`,
        };
      }

      const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const branch = `convex-token-test-${suffix}`;
      const filePath = `convex-token-smoke-${suffix}.txt`;
      const fileBody = [
        "Convex GITHUB_TOKEN smoke test",
        `Created at ${new Date().toISOString()}`,
        "",
        "Safe to close this PR and delete the branch + file after verifying the token.",
      ].join("\n");

      const encodedPath = filePath
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");

      // Create the branch ref first. The Contents API often returns 404 if you only pass a new
      // branch name without an existing ref (auto-create is unreliable).
      const createRefRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/refs`,
        {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ref: `refs/heads/${branch}`,
            sha: baseSha,
          }),
        },
      );

      if (!createRefRes.ok) {
        return {
          ok: false,
          pullRequestUrl: null,
          pullRequestNumber: null,
          branch,
          error: `Could not create branch (${createRefRes.status}): ${await readGithubError(createRefRes)}`,
        };
      }

      const putRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`,
        {
          method: "PUT",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: "chore: Convex GITHUB_TOKEN smoke test",
            content: Buffer.from(fileBody, "utf8").toString("base64"),
            branch,
          }),
        },
      );

      if (!putRes.ok) {
        return {
          ok: false,
          pullRequestUrl: null,
          pullRequestNumber: null,
          branch,
          error: `Could not create test commit (${putRes.status}): ${await readGithubError(putRes)}`,
        };
      }

      const prRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls`,
        {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: "Convex dev tools: GITHUB_TOKEN smoke test",
            head: branch,
            base,
            body: [
              "Opened by **convex-todo-app** dev tools (`/dev`) to verify `GITHUB_TOKEN` can create commits and pull requests.",
              "",
              `Branch: \`${branch}\` · File: \`${filePath}\``,
            ].join("\n"),
          }),
        },
      );

      if (!prRes.ok) {
        return {
          ok: false,
          pullRequestUrl: null,
          pullRequestNumber: null,
          branch,
          error: `Commit succeeded but could not open PR (${prRes.status}): ${await readGithubError(prRes)}`,
        };
      }

      const prJson = await prRes.json();
      const prPayload = githubPullRequestSchema.safeParse(prJson);

      return {
        ok: true,
        pullRequestUrl: prPayload.success ? prPayload.data.html_url : null,
        pullRequestNumber: prPayload.success ? prPayload.data.number : null,
        branch,
        error: null,
      };
    } catch (err) {
      return {
        ok: false,
        pullRequestUrl: null,
        pullRequestNumber: null,
        branch: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});
