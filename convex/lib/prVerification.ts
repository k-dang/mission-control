const PR_URL_PATTERN =
  /https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+/gi;
const NOOP_PATTERNS = [
  /\bno files changed\b/i,
  /\bno changes to commit\b/i,
  /\bnothing to commit\b/i,
  /\bno pull request was created\b/i,
  /\bdid not create (?:a |any )?(?:branch|commit|pull request|pr)\b/i,
];

type OpencodeMessage = {
  info: { role: string; time?: { created: number } };
  parts: Array<{ type: string; text?: string; synthetic?: boolean; ignored?: boolean }>;
};

export type ParsedPrUrl = {
  owner: string;
  repo: string;
  number: number;
  canonicalUrl: string;
};

export type ParsedGithubRepo = {
  owner: string;
  repo: string;
};

export type PrVerificationInputs = {
  candidatePrUrl: string | null;
  finalAssistantText: string;
  verified: boolean;
};

export type PrVerificationClassification =
  | { kind: "noop" }
  | { kind: "verified"; prUrl: string }
  | { kind: "verificationFailed" };

export type PrVerificationSignals = {
  candidatePrUrl: string | null;
  finalAssistantText: string;
};

function getAssistantMessageTexts(messages: OpencodeMessage[]): string[] {
  return messages
    .filter((message) => message.info.role === "assistant")
    .sort((a, b) => (a.info.time?.created ?? 0) - (b.info.time?.created ?? 0))
    .map((message) =>
      message.parts
        .filter(
          (part) =>
            part.type === "text" &&
            typeof part.text === "string" &&
            !part.synthetic &&
            !part.ignored,
        )
        .map((part) => part.text as string)
        .join("\n"),
    );
}

export function extractPrVerificationSignals(
  messages: OpencodeMessage[],
): PrVerificationSignals {
  const assistantTexts = getAssistantMessageTexts(messages);
  let candidatePrUrl: string | null = null;

  for (const text of assistantTexts) {
    const extracted = extractPrUrlFromText(text);
    if (extracted) {
      candidatePrUrl = extracted;
    }
  }

  return {
    candidatePrUrl,
    finalAssistantText: assistantTexts[assistantTexts.length - 1] ?? "",
  };
}

export function looksLikeNoopAssistantResponse(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }
  return NOOP_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function extractPrUrlFromText(text: string): string | null {
  if (!text) return null;
  const matches = text.match(PR_URL_PATTERN);
  if (!matches || matches.length === 0) return null;
  const last = matches[matches.length - 1];
  return last.replace(/[.,;:)\]]+$/, "");
}

export function parsePrUrl(prUrl: string): ParsedPrUrl | null {
  const match = prUrl.match(
    /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)/i,
  );
  if (!match) return null;
  const owner = match[1];
  const repo = match[2].replace(/\.git$/i, "");
  const number = Number(match[3]);
  return {
    owner,
    repo,
    number,
    canonicalUrl: `https://github.com/${owner}/${repo}/pull/${number}`,
  };
}

export function parseGithubRepoUrl(githubUrl: string): ParsedGithubRepo | null {
  const match = githubUrl.match(
    /github\.com[:/]+([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/?#]|$)/i,
  );
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

export function prUrlMatchesRepo(
  parsedPr: ParsedPrUrl,
  repo: ParsedGithubRepo,
): boolean {
  return (
    parsedPr.owner.toLowerCase() === repo.owner.toLowerCase() &&
    parsedPr.repo.toLowerCase() === repo.repo.toLowerCase()
  );
}

export function classifyPrVerification(
  inputs: PrVerificationInputs,
): PrVerificationClassification {
  if (inputs.verified && inputs.candidatePrUrl) {
    return { kind: "verified", prUrl: inputs.candidatePrUrl };
  }
  if (looksLikeNoopAssistantResponse(inputs.finalAssistantText)) {
    return { kind: "noop" };
  }
  return { kind: "verificationFailed" };
}

export async function verifyPrExistsOnGitHub(
  parsedPr: ParsedPrUrl,
  githubToken: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const apiUrl = `https://api.github.com/repos/${parsedPr.owner}/${parsedPr.repo}/pulls/${parsedPr.number}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "convex-todo-app",
  };
  if (githubToken?.trim()) {
    headers.Authorization = `Bearer ${githubToken.trim()}`;
  }

  const response = await fetchImpl(apiUrl, { headers });
  if (response.status === 200) {
    try {
      const body = (await response.json()) as { state?: string; draft?: boolean };
      return body.state !== undefined;
    } catch {
      return true;
    }
  }
  return false;
}
