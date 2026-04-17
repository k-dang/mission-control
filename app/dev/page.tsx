"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2, ArrowLeft } from "lucide-react";

if (process.env.NODE_ENV === "production") {
  throw new Error("Dev tools page is not available in production.");
}

type CheckResult = {
  configured: boolean;
  authenticated: boolean;
  login: string | null;
  error: string | null;
};

export default function DevPage() {
  const checkGithubToken = useAction(api.devTools.checkGithubToken);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);

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
