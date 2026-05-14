"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import Link from "next/link";
import {
  CheckCircle,
  XCircle,
  Loader2,
  ArrowLeft,
  GitPullRequest,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

export default function DevPageClient() {
  const checkGithubToken = useAction(api.devTools.checkGithubToken);
  const createTestPr = useAction(api.devTools.createMissionControlTestPullRequest);
  const checkOpencodeInstall = useAction(
    api.devTools.checkOpencodeInstall,
  );
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [prResult, setPrResult] = useState<PrResult | null>(null);
  const [prLoading, setPrLoading] = useState(false);
  const [opencodeResult, setOpencodeResult] =
    useState<OpencodeInstallResult | null>(null);
  const [opencodeLoading, setOpencodeLoading] = useState(false);

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

      <section className="max-w-md space-y-4">
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
      </section>
    </main>
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
