"use client";

import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import Link from "next/link";
import {
  CheckCircle,
  XCircle,
  Loader2,
  ArrowLeft,
  GitPullRequest,
  Terminal,
  Send,
  Square,
  Trash2,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  PI_RUN_CONFIGURATION_PROVIDER_OPTIONS,
  RUN_CONFIGURATION_PROVIDERS,
} from "@/convex/lib/runConfiguration";
import { api } from "../../convex/_generated/api";

type CheckResult = {
  configured: boolean;
  authenticated: boolean;
  login: string | null;
  error: string | null;
};

type PrResult = {
  ok: boolean;
  pullRequestUrl: string | null;
  pullRequestNumber: number | null;
  branch: string | null;
  error: string | null;
};

type OpencodeInstallResult = {
  ok: boolean;
  expectedVersion: string;
  installedVersion: string | null;
  sandboxId: string | null;
  error: string | null;
};

type RuntimeProviderId = "vercel" | "openrouter" | "opencode";

type RunConfigurationResult = {
  ok: boolean;
  providerId: string;
  modelId: string;
  opencodeModel: string | null;
  enabledProviders: string[];
  error: string | null;
};

type SmokeSandboxResult = {
  ok: boolean;
  providerId: string;
  modelId: string;
  opencodeModel: string | null;
  sandboxId: string | null;
  opencodeUrl: string | null;
  sessionId: string | null;
  installedVersion: string | null;
  error: string | null;
};

type SmokePromptResult = {
  ok: boolean;
  providerId: string;
  modelId: string;
  sessionId: string;
  error: string | null;
};

type StopSmokeSandboxResult = {
  ok: boolean;
  sandboxId: string;
  error: string | null;
};

type PiSmokeProviderId = "vercel-ai-gateway" | "openrouter";

type PiSmokeSandboxResult = {
  ok: boolean;
  providerId: string;
  modelId: string;
  modelReference: string | null;
  githubUrl: string;
  sandboxId: string | null;
  commandId: string | null;
  installedVersion: string | null;
  error: string | null;
};

type PiSmokeMonitorResult = {
  ok: boolean;
  terminalState: "COMPLETED" | "FAILED" | null;
  terminalReason: string | null;
  capturedEventCount: number;
  capturedEventKinds: string[];
  pr:
    | { kind: "created"; prUrl: string; prNumber: number; branchName: string }
    | { kind: "noChanges" }
    | null;
  error: string | null;
};

type ClearRecordsResult = {
  deleted: {
    todos: number;
    todoAttempts: number;
    todoEvents: number;
    toolCallCounts: number;
  };
  complete: boolean;
  error: string | null;
};

export default function DevPageClient() {
  const checkGithubToken = useAction(api.devTools.checkGithubToken);
  const createTestPr = useAction(api.devTools.createMissionControlTestPullRequest);
  const checkOpencodeInstall = useAction(
    api.devTools.checkOpencodeInstall,
  );
  const checkRunConfiguration = useAction(
    api.devTools.checkRunConfiguration,
  );
  const startSmokeSandbox = useAction(api.devTools.startOpencodeSmokeSandbox);
  const sendSmokePrompt = useAction(api.devTools.sendOpencodeSmokePrompt);
  const stopSmokeSandbox = useAction(api.devTools.stopOpencodeSmokeSandbox);
  const startPiSmokeSandbox = useAction(api.devTools.startPiSmokeSandbox);
  const monitorPiSmokeSandbox = useAction(api.devTools.monitorPiSmokeSandbox);
  const clearRecords = useMutation(api.devDatabase.clearRecords);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [prResult, setPrResult] = useState<PrResult | null>(null);
  const [prLoading, setPrLoading] = useState(false);
  const [opencodeResult, setOpencodeResult] =
    useState<OpencodeInstallResult | null>(null);
  const [opencodeLoading, setOpencodeLoading] = useState(false);
  const [runtimeResult, setRuntimeResult] =
    useState<RunConfigurationResult | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState<RuntimeProviderId | null>(
    null,
  );
  const [smokeProviderId, setSmokeProviderId] =
    useState<RuntimeProviderId>("vercel");
  const [smokeSandbox, setSmokeSandbox] = useState<SmokeSandboxResult | null>(
    null,
  );
  const [smokePromptResult, setSmokePromptResult] =
    useState<SmokePromptResult | null>(null);
  const [stopSmokeSandboxResult, setStopSmokeSandboxResult] =
    useState<StopSmokeSandboxResult | null>(null);
  const [smokeSandboxLoading, setSmokeSandboxLoading] = useState(false);
  const [smokePromptLoading, setSmokePromptLoading] = useState(false);
  const [stopSmokeSandboxLoading, setStopSmokeSandboxLoading] = useState(false);
  const [clearRecordsLoading, setClearRecordsLoading] = useState(false);
  const [clearRecordsResult, setClearRecordsResult] =
    useState<ClearRecordsResult | null>(null);
  const [smokePrompt, setSmokePrompt] = useState(
    "Reply with the active model and say whether this OpenCode session is healthy.",
  );
  const [piSmokeProviderId, setPiSmokeProviderId] =
    useState<PiSmokeProviderId>("openrouter");
  const [piSmokeSandbox, setPiSmokeSandbox] =
    useState<PiSmokeSandboxResult | null>(null);
  const [piSmokeMonitorResult, setPiSmokeMonitorResult] =
    useState<PiSmokeMonitorResult | null>(null);
  const [piStopSmokeSandboxResult, setPiStopSmokeSandboxResult] =
    useState<StopSmokeSandboxResult | null>(null);
  const [piSmokeSandboxLoading, setPiSmokeSandboxLoading] = useState(false);
  const [piSmokeMonitorLoading, setPiSmokeMonitorLoading] = useState(false);
  const [piStopSmokeSandboxLoading, setPiStopSmokeSandboxLoading] =
    useState(false);

  const handleCheck = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await checkGithubToken({});
      setResult(res);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePr = async () => {
    setPrLoading(true);
    setPrResult(null);
    try {
      const res = await createTestPr({});
      setPrResult(res);
    } finally {
      setPrLoading(false);
    }
  };

  const handleCheckOpencodeInstall = async () => {
    setOpencodeLoading(true);
    setOpencodeResult(null);
    try {
      const res = await checkOpencodeInstall({});
      setOpencodeResult(res);
    } finally {
      setOpencodeLoading(false);
    }
  };

  const handleCheckRuntime = async (providerId: RuntimeProviderId) => {
    setRuntimeLoading(providerId);
    setRuntimeResult(null);
    try {
      const res = await checkRunConfiguration({ providerId });
      setRuntimeResult(res);
    } finally {
      setRuntimeLoading(null);
    }
  };

  const handleStartSmokeSandbox = async () => {
    setSmokeSandboxLoading(true);
    setSmokeSandbox(null);
    setSmokePromptResult(null);
    setStopSmokeSandboxResult(null);
    try {
      const res = await startSmokeSandbox({ providerId: smokeProviderId });
      setSmokeSandbox(res);
    } finally {
      setSmokeSandboxLoading(false);
    }
  };

  const handleSendSmokePrompt = async () => {
    if (
      !smokeSandbox?.sandboxId ||
      !smokeSandbox.opencodeUrl ||
      !smokeSandbox.sessionId
    ) {
      return;
    }

    setSmokePromptLoading(true);
    setSmokePromptResult(null);
    try {
      const res = await sendSmokePrompt({
        providerId: smokeProviderId,
        sandboxId: smokeSandbox.sandboxId,
        opencodeUrl: smokeSandbox.opencodeUrl,
        sessionId: smokeSandbox.sessionId,
        prompt: smokePrompt,
      });
      setSmokePromptResult(res);
    } finally {
      setSmokePromptLoading(false);
    }
  };

  const handleStopSmokeSandbox = async () => {
    if (!smokeSandbox?.sandboxId) {
      return;
    }

    setStopSmokeSandboxLoading(true);
    setStopSmokeSandboxResult(null);
    try {
      const res = await stopSmokeSandbox({ sandboxId: smokeSandbox.sandboxId });
      setStopSmokeSandboxResult(res);
    } finally {
      setStopSmokeSandboxLoading(false);
    }
  };

  const handleStartPiSmokeSandbox = async () => {
    setPiSmokeSandboxLoading(true);
    setPiSmokeSandbox(null);
    setPiSmokeMonitorResult(null);
    setPiStopSmokeSandboxResult(null);
    try {
      const res = await startPiSmokeSandbox({ providerId: piSmokeProviderId });
      setPiSmokeSandbox(res);
    } finally {
      setPiSmokeSandboxLoading(false);
    }
  };

  const handleMonitorPiSmokeSandbox = async () => {
    if (!piSmokeSandbox?.sandboxId || !piSmokeSandbox.commandId) {
      return;
    }

    setPiSmokeMonitorLoading(true);
    setPiSmokeMonitorResult(null);
    try {
      const res = await monitorPiSmokeSandbox({
        sandboxId: piSmokeSandbox.sandboxId,
        commandId: piSmokeSandbox.commandId,
      });
      setPiSmokeMonitorResult(res);
    } finally {
      setPiSmokeMonitorLoading(false);
    }
  };

  const handleStopPiSmokeSandbox = async () => {
    if (!piSmokeSandbox?.sandboxId) {
      return;
    }

    setPiStopSmokeSandboxLoading(true);
    setPiStopSmokeSandboxResult(null);
    try {
      const res = await stopSmokeSandbox({ sandboxId: piSmokeSandbox.sandboxId });
      setPiStopSmokeSandboxResult(res);
    } finally {
      setPiStopSmokeSandboxLoading(false);
    }
  };

  const handleClearRecords = async () => {
    if (
      !window.confirm(
        "Clear all todos, sandbox rows, todo events, and tool call counts?",
      )
    ) {
      return;
    }

    setClearRecordsLoading(true);
    setClearRecordsResult(null);
    try {
      const total: ClearRecordsResult = {
        deleted: {
          todos: 0,
          todoAttempts: 0,
          todoEvents: 0,
          toolCallCounts: 0,
        },
        complete: false,
        error: null,
      };

      while (!total.complete) {
        const res = await clearRecords({});
        total.deleted.todos += res.deleted.todos;
        total.deleted.todoAttempts += res.deleted.todoAttempts;
        total.deleted.todoEvents += res.deleted.todoEvents;
        total.deleted.toolCallCounts += res.deleted.toolCallCounts;
        total.complete = res.complete;
        setClearRecordsResult({ ...total, deleted: { ...total.deleted } });
      }
    } catch (err) {
      setClearRecordsResult({
        deleted: {
          todos: 0,
          todoAttempts: 0,
          todoEvents: 0,
          toolCallCounts: 0,
        },
        complete: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setClearRecordsLoading(false);
    }
  };

  const canSendSmokePrompt =
    smokeSandbox?.ok === true &&
    Boolean(smokeSandbox.sandboxId) &&
    Boolean(smokeSandbox.opencodeUrl) &&
    Boolean(smokeSandbox.sessionId) &&
    smokePrompt.trim().length > 0 &&
    stopSmokeSandboxResult?.ok !== true &&
    !smokePromptLoading &&
    !stopSmokeSandboxLoading;

  const canStopSmokeSandbox =
    Boolean(smokeSandbox?.sandboxId) &&
    stopSmokeSandboxResult?.ok !== true &&
    !smokeSandboxLoading &&
    !smokePromptLoading &&
    !stopSmokeSandboxLoading;

  const canMonitorPiSmoke =
    piSmokeSandbox?.ok === true &&
    Boolean(piSmokeSandbox.sandboxId) &&
    Boolean(piSmokeSandbox.commandId) &&
    piStopSmokeSandboxResult?.ok !== true &&
    !piSmokeMonitorLoading &&
    !piStopSmokeSandboxLoading;

  const canStopPiSmokeSandbox =
    Boolean(piSmokeSandbox?.sandboxId) &&
    piStopSmokeSandboxResult?.ok !== true &&
    !piSmokeSandboxLoading &&
    !piSmokeMonitorLoading &&
    !piStopSmokeSandboxLoading;

  return (
    <main className="min-h-screen space-y-8 p-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Home
      </Link>
      <h1 className="text-2xl font-bold">Dev Tools</h1>

      <div className="grid items-start gap-6 md:grid-cols-2">
      <section className="space-y-4 rounded-lg border border-destructive/40 p-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Database Records</h2>
          <p className="text-sm text-muted-foreground">
            Clears app-owned records from todos, attempts, events, and tool
            call count tables. Requires Convex dev tools to be enabled.
          </p>
        </div>

        <Button
          onClick={handleClearRecords}
          disabled={clearRecordsLoading}
          variant="destructive"
        >
          {clearRecordsLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          {clearRecordsLoading ? "Clearing records..." : "Clear database records"}
        </Button>

        {clearRecordsResult !== null && (
          <div className="space-y-2 rounded-lg border p-4 text-sm">
            <Row
              label="Clear complete"
              ok={clearRecordsResult.complete && !clearRecordsResult.error}
              value={clearRecordsResult.complete ? "Yes" : "Clearing"}
            />
            <CountRow label="Todos" value={clearRecordsResult.deleted.todos} />
            <CountRow label="Attempts" value={clearRecordsResult.deleted.todoAttempts} />
            <CountRow label="Events" value={clearRecordsResult.deleted.todoEvents} />
            <CountRow
              label="Tool calls"
              value={clearRecordsResult.deleted.toolCallCounts}
            />
            {clearRecordsResult.error && (
              <p className="pt-1 text-destructive">{clearRecordsResult.error}</p>
            )}
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">GitHub Token</h2>
        <p className="text-sm text-muted-foreground">
          Verifies that <code className="font-mono">GITHUB_TOKEN</code> is
          configured in Convex and can authenticate against the GitHub API.
        </p>
        <Button onClick={handleCheck} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? "Checking..." : "Check GitHub Token"}
        </Button>

        {result !== null && (
          <div className="space-y-2 rounded-lg border p-4 text-sm">
            <Row
              label="Token configured"
              ok={result.configured}
              value={result.configured ? "Yes" : "No"}
            />
            <Row
              label="Authenticated"
              ok={result.authenticated}
              value={result.authenticated ? "Yes" : "No"}
            />
            {result.login && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">GitHub login</span>
                <span className="font-mono font-medium">{result.login}</span>
              </div>
            )}
            {result.error && <p className="pt-1 text-destructive">{result.error}</p>}
          </div>
        )}

        <p className="pt-2 text-sm text-muted-foreground">
          Opens a real PR on{" "}
          <a
            href="https://github.com/k-dang/mission-control"
            className="underline underline-offset-2 hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            k-dang/mission-control
          </a>
          : creates a small text file on a new branch, then opens the PR (needs
          contents + PR permissions on the token).
        </p>
        <Button onClick={handleCreatePr} disabled={prLoading} variant="secondary">
          {prLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GitPullRequest className="h-4 w-4" />
          )}
          {prLoading ? "Creating PR…" : "Create smoke-test PR"}
        </Button>

        {prResult !== null && (
          <div className="space-y-2 rounded-lg border p-4 text-sm">
            <Row
              label="PR created"
              ok={prResult.ok}
              value={prResult.ok ? "Yes" : "No"}
            />
            {prResult.pullRequestNumber !== null && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">PR #</span>
                <span className="font-mono font-medium">
                  {prResult.pullRequestNumber}
                </span>
              </div>
            )}
            {prResult.branch && (
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 text-muted-foreground">Branch</span>
                <span className="break-all text-right font-mono text-xs">
                  {prResult.branch}
                </span>
              </div>
            )}
            {prResult.pullRequestUrl && (
              <a
                href={prResult.pullRequestUrl}
                className="block break-all text-primary underline underline-offset-2"
                target="_blank"
                rel="noreferrer"
              >
                {prResult.pullRequestUrl}
              </a>
            )}
            {prResult.error && <p className="pt-1 text-destructive">{prResult.error}</p>}
          </div>
        )}

        <p className="pt-2 text-sm text-muted-foreground">
          Starts a temporary Vercel sandbox, installs OpenCode, confirms the
          binary runs, logs the installed version, then stops the sandbox.
        </p>
        <Button
          onClick={handleCheckOpencodeInstall}
          disabled={opencodeLoading}
          variant="secondary"
        >
          {opencodeLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Terminal className="h-4 w-4" />
          )}
          {opencodeLoading ? "Checking OpenCode..." : "Check OpenCode install"}
        </Button>

        {opencodeResult !== null && (
          <div className="space-y-2 rounded-lg border p-4 text-sm">
            <Row
              label="Install check"
              ok={opencodeResult.ok}
              value={opencodeResult.ok ? "Passed" : "Failed"}
            />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Expected</span>
              <span className="font-mono font-medium">
                {opencodeResult.expectedVersion}
              </span>
            </div>
            {opencodeResult.installedVersion && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Installed</span>
                <span className="font-mono font-medium">
                  {opencodeResult.installedVersion}
                </span>
              </div>
            )}
            {opencodeResult.sandboxId && (
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 text-muted-foreground">Sandbox</span>
                <span className="break-all text-right font-mono text-xs">
                  {opencodeResult.sandboxId}
                </span>
              </div>
            )}
            {opencodeResult.error && (
              <p className="pt-1 text-destructive">{opencodeResult.error}</p>
            )}
          </div>
        )}

        <p className="pt-2 text-sm text-muted-foreground">
          Verifies each run configuration path and generated OpenCode model
          routing without exposing provider credentials.
        </p>
        <div className="flex flex-wrap gap-2">
          {RUN_CONFIGURATION_PROVIDERS.map((provider) => (
            <Button
              key={provider.id}
              onClick={() => handleCheckRuntime(provider.id)}
              disabled={runtimeLoading !== null}
              variant="secondary"
            >
              {runtimeLoading === provider.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Terminal className="h-4 w-4" />
              )}
              {runtimeLoading === provider.id
                ? `Checking ${provider.label}...`
                : `Check ${provider.label}`}
            </Button>
          ))}
        </div>

        {runtimeResult !== null && (
          <div className="space-y-2 rounded-lg border p-4 text-sm">
            <Row
              label="Runtime check"
              ok={runtimeResult.ok}
              value={runtimeResult.ok ? "Passed" : "Failed"}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="shrink-0 text-muted-foreground">Run config</span>
              <span className="break-all text-right font-mono text-xs">
                {runtimeResult.providerId}/{runtimeResult.modelId}
              </span>
            </div>
            {runtimeResult.opencodeModel && (
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 text-muted-foreground">Main model</span>
                <span className="break-all text-right font-mono text-xs">
                  {runtimeResult.opencodeModel}
                </span>
              </div>
            )}
            {runtimeResult.enabledProviders.length > 0 && (
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 text-muted-foreground">Providers</span>
                <span className="break-all text-right font-mono text-xs">
                  {runtimeResult.enabledProviders.join(", ")}
                </span>
              </div>
            )}
            {runtimeResult.error && (
              <p className="pt-1 text-destructive">{runtimeResult.error}</p>
            )}
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-lg border p-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">OpenCode config smoke test</h2>
          <p className="text-sm text-muted-foreground">
            Pick one supported run config, start a temporary sandbox with
            OpenCode configured for it, then send a prompt to verify the session
            accepts work.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="smoke-run-config">Run config</Label>
          <Select
            value={smokeProviderId}
            disabled={smokeSandboxLoading || smokePromptLoading}
            onValueChange={(value) => {
              setSmokeProviderId(value as RuntimeProviderId);
              setSmokeSandbox(null);
              setSmokePromptResult(null);
              setStopSmokeSandboxResult(null);
            }}
          >
            <SelectTrigger id="smoke-run-config" className="max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RUN_CONFIGURATION_PROVIDERS.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {provider.label} · {provider.models[0]?.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleStartSmokeSandbox}
            disabled={
              smokeSandboxLoading || smokePromptLoading || stopSmokeSandboxLoading
            }
            variant="secondary"
          >
            {smokeSandboxLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Terminal className="h-4 w-4" />
            )}
            {smokeSandboxLoading ? "Starting sandbox..." : "Start smoke sandbox"}
          </Button>
          <Button
            onClick={handleStopSmokeSandbox}
            disabled={!canStopSmokeSandbox}
            variant="secondary"
          >
            {stopSmokeSandboxLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            {stopSmokeSandboxLoading ? "Stopping sandbox..." : "Stop sandbox"}
          </Button>
        </div>

        {smokeSandbox !== null && (
          <div className="space-y-2 rounded-lg border p-4 text-sm">
            <Row
              label="Sandbox ready"
              ok={smokeSandbox.ok}
              value={smokeSandbox.ok ? "Yes" : "No"}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="shrink-0 text-muted-foreground">Run config</span>
              <span className="break-all text-right font-mono text-xs">
                {smokeSandbox.providerId}/{smokeSandbox.modelId}
              </span>
            </div>
            {smokeSandbox.opencodeModel && (
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 text-muted-foreground">OpenCode model</span>
                <span className="break-all text-right font-mono text-xs">
                  {smokeSandbox.opencodeModel}
                </span>
              </div>
            )}
            {smokeSandbox.installedVersion && (
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 text-muted-foreground">OpenCode version</span>
                <span className="break-all text-right font-mono text-xs">
                  {smokeSandbox.installedVersion}
                </span>
              </div>
            )}
            {smokeSandbox.sandboxId && (
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 text-muted-foreground">Sandbox</span>
                <span className="break-all text-right font-mono text-xs">
                  {smokeSandbox.sandboxId}
                </span>
              </div>
            )}
            {smokeSandbox.opencodeUrl && (
              <a
                href={smokeSandbox.opencodeUrl}
                className="block break-all text-primary underline underline-offset-2"
                target="_blank"
                rel="noreferrer"
              >
                {smokeSandbox.opencodeUrl}
              </a>
            )}
            {smokeSandbox.error && (
              <p className="pt-1 text-destructive">{smokeSandbox.error}</p>
            )}
            {stopSmokeSandboxResult !== null && (
              <Row
                label="Sandbox stopped"
                ok={stopSmokeSandboxResult.ok}
                value={stopSmokeSandboxResult.ok ? "Yes" : "No"}
              />
            )}
            {stopSmokeSandboxResult?.error && (
              <p className="pt-1 text-destructive">
                {stopSmokeSandboxResult.error}
              </p>
            )}
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="smoke-prompt">Test prompt</Label>
          <Textarea
            id="smoke-prompt"
            value={smokePrompt}
            onChange={(event) => setSmokePrompt(event.target.value)}
            disabled={smokePromptLoading}
            className="min-h-24"
          />
        </div>

        <Button onClick={handleSendSmokePrompt} disabled={!canSendSmokePrompt}>
          {smokePromptLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {smokePromptLoading ? "Sending prompt..." : "Send test prompt"}
        </Button>

        {smokePromptResult !== null && (
          <div className="space-y-2 rounded-lg border p-4 text-sm">
            <Row
              label="Prompt accepted"
              ok={smokePromptResult.ok}
              value={smokePromptResult.ok ? "Yes" : "No"}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="shrink-0 text-muted-foreground">Session</span>
              <span className="break-all text-right font-mono text-xs">
                {smokePromptResult.sessionId}
              </span>
            </div>
            {smokePromptResult.error && (
              <p className="pt-1 text-destructive">{smokePromptResult.error}</p>
            )}
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-lg border p-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Pi config smoke test</h2>
          <p className="text-sm text-muted-foreground">
            Pick a curated Pi provider, start a temporary sandbox that installs
            Pi and runs a fixed task against{" "}
            <a
              href="https://github.com/k-dang/mission-control"
              className="underline underline-offset-2 hover:text-foreground"
              target="_blank"
              rel="noreferrer"
            >
              k-dang/mission-control
            </a>
            , then monitor it to a terminal state (opens a PR on success).
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="pi-smoke-run-config">Provider</Label>
          <Select
            value={piSmokeProviderId}
            disabled={piSmokeSandboxLoading || piSmokeMonitorLoading}
            onValueChange={(value) => {
              setPiSmokeProviderId(value as PiSmokeProviderId);
              setPiSmokeSandbox(null);
              setPiSmokeMonitorResult(null);
              setPiStopSmokeSandboxResult(null);
            }}
          >
            <SelectTrigger id="pi-smoke-run-config" className="max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PI_RUN_CONFIGURATION_PROVIDER_OPTIONS.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {provider.label} · {provider.models[0]?.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleStartPiSmokeSandbox}
            disabled={
              piSmokeSandboxLoading ||
              piSmokeMonitorLoading ||
              piStopSmokeSandboxLoading
            }
            variant="secondary"
          >
            {piSmokeSandboxLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Terminal className="h-4 w-4" />
            )}
            {piSmokeSandboxLoading ? "Starting sandbox..." : "Start smoke sandbox"}
          </Button>
          <Button
            onClick={handleMonitorPiSmokeSandbox}
            disabled={!canMonitorPiSmoke}
            variant="secondary"
          >
            {piSmokeMonitorLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Activity className="h-4 w-4" />
            )}
            {piSmokeMonitorLoading ? "Monitoring (up to 5m)..." : "Monitor run"}
          </Button>
          <Button
            onClick={handleStopPiSmokeSandbox}
            disabled={!canStopPiSmokeSandbox}
            variant="secondary"
          >
            {piStopSmokeSandboxLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            {piStopSmokeSandboxLoading ? "Stopping sandbox..." : "Stop sandbox"}
          </Button>
        </div>

        {piSmokeSandbox !== null && (
          <div className="space-y-2 rounded-lg border p-4 text-sm">
            <Row
              label="Sandbox ready"
              ok={piSmokeSandbox.ok}
              value={piSmokeSandbox.ok ? "Yes" : "No"}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="shrink-0 text-muted-foreground">Run config</span>
              <span className="break-all text-right font-mono text-xs">
                {piSmokeSandbox.providerId}/{piSmokeSandbox.modelId}
              </span>
            </div>
            {piSmokeSandbox.modelReference && (
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 text-muted-foreground">Pi model ref</span>
                <span className="break-all text-right font-mono text-xs">
                  {piSmokeSandbox.modelReference}
                </span>
              </div>
            )}
            {piSmokeSandbox.installedVersion && (
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 text-muted-foreground">Pi version</span>
                <span className="break-all text-right font-mono text-xs">
                  {piSmokeSandbox.installedVersion}
                </span>
              </div>
            )}
            {piSmokeSandbox.sandboxId && (
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 text-muted-foreground">Sandbox</span>
                <span className="break-all text-right font-mono text-xs">
                  {piSmokeSandbox.sandboxId}
                </span>
              </div>
            )}
            {piSmokeSandbox.commandId && (
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 text-muted-foreground">Command</span>
                <span className="break-all text-right font-mono text-xs">
                  {piSmokeSandbox.commandId}
                </span>
              </div>
            )}
            {piSmokeSandbox.error && (
              <p className="pt-1 text-destructive">{piSmokeSandbox.error}</p>
            )}
          </div>
        )}

        {piSmokeMonitorResult !== null && (
          <div className="space-y-2 rounded-lg border p-4 text-sm">
            <Row
              label="Terminal state"
              ok={piSmokeMonitorResult.terminalState === "COMPLETED"}
              value={piSmokeMonitorResult.terminalState ?? "Unknown"}
            />
            {piSmokeMonitorResult.terminalReason && (
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 text-muted-foreground">Reason</span>
                <span className="break-all text-right text-xs">
                  {piSmokeMonitorResult.terminalReason}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="shrink-0 text-muted-foreground">Events</span>
              <span className="break-all text-right font-mono text-xs">
                {piSmokeMonitorResult.capturedEventCount} (
                {piSmokeMonitorResult.capturedEventKinds.join(", ")})
              </span>
            </div>
            {piSmokeMonitorResult.pr?.kind === "created" && (
              <a
                href={piSmokeMonitorResult.pr.prUrl}
                className="block break-all text-primary underline underline-offset-2"
                target="_blank"
                rel="noreferrer"
              >
                {piSmokeMonitorResult.pr.prUrl}
              </a>
            )}
            {piSmokeMonitorResult.pr?.kind === "noChanges" && (
              <p className="text-muted-foreground">
                Pi made no repository changes; no PR opened.
              </p>
            )}
            {piSmokeMonitorResult.error && (
              <p className="pt-1 text-destructive">{piSmokeMonitorResult.error}</p>
            )}
          </div>
        )}

        {piStopSmokeSandboxResult !== null && (
          <div className="space-y-2 rounded-lg border p-4 text-sm">
            <Row
              label="Sandbox stopped"
              ok={piStopSmokeSandboxResult.ok}
              value={piStopSmokeSandboxResult.ok ? "Yes" : "No"}
            />
            {piStopSmokeSandboxResult.error && (
              <p className="pt-1 text-destructive">
                {piStopSmokeSandboxResult.error}
              </p>
            )}
          </div>
        )}
      </section>
      </div>
    </main>
  );
}

function CountRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}

function Row({
  label,
  ok,
  value,
}: {
  label: string;
  ok: boolean;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5 font-medium">
        {ok ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <XCircle className="h-4 w-4 text-destructive" />
        )}
        {value}
      </span>
    </div>
  );
}
