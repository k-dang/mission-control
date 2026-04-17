"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2, ArrowLeft, GitPullRequest } from "lucide-react";

if (process.env.NODE_ENV === "production") {
  throw new Error("Dev tools page is not available in production.");
}

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

export default function DevPage() {
  const checkGithubToken = useAction(api.devTools.checkGithubToken);
  const createTestPr = useAction(api.devTools.createMissionControlTestPullRequest);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [prResult, setPrResult] = useState<PrResult | null>(null);
  const [prLoading, setPrLoading] = useState(false);

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

  return (
    <main className="min-h-screen p-10 space-y-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Home
      </Link>
      <h1 className="text-2xl font-bold">Dev Tools</h1>

      <section className="space-y-4 max-w-md">
        <h2 className="text-lg font-semibold">GitHub Token</h2>
        <p className="text-sm text-muted-foreground">
          Verifies that <code className="font-mono">GITHUB_TOKEN</code> is
          configured in Convex and can authenticate against the GitHub API.
        </p>
        <Button onClick={handleCheck} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          {loading ? "Checking..." : "Check GitHub Token"}
        </Button>

        {result !== null && (
          <div className="rounded-lg border p-4 space-y-2 text-sm">
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
            {result.error && (
              <p className="text-destructive pt-1">{result.error}</p>
            )}
          </div>
        )}

        <p className="text-sm text-muted-foreground pt-2">
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
          <div className="rounded-lg border p-4 space-y-2 text-sm">
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
                <span className="text-muted-foreground shrink-0">Branch</span>
                <span className="font-mono text-xs text-right break-all">
                  {prResult.branch}
                </span>
              </div>
            )}
            {prResult.pullRequestUrl && (
              <a
                href={prResult.pullRequestUrl}
                className="block text-primary underline underline-offset-2 break-all"
                target="_blank"
                rel="noreferrer"
              >
                {prResult.pullRequestUrl}
              </a>
            )}
            {prResult.error && (
              <p className="text-destructive pt-1">{prResult.error}</p>
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
