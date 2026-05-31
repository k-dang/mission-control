# Mission Control

An AI-powered task board where dragging a card to **In Progress** spawns a sandboxed coding agent that works the task autonomously and opens a pull request when done.

## Stack

- [Next.js](https://nextjs.org/) 16 (App Router) + React 19
- [Convex](https://convex.dev/) — real-time database and backend functions
- [Clerk](https://clerk.com/) — authentication
- [OpenCode](https://opencode.ai/) — AI coding agent
- [Vercel Sandbox](https://vercel.com/docs/sandbox) — isolated execution environments
- [Tailwind CSS](https://tailwindcss.com/) v4

## How it works

1. Create a task with a title, description, and GitHub repo URL.
2. Drag the card from **Todo** into **In Progress**.
3. Convex spins up a Vercel sandbox, clones the repo, and runs an OpenCode session against it.
4. The board updates in real time as the agent works — tool call counts, stream state, and events are all tracked.
5. On completion the task moves to **Completed** with a PR link, or to **Failed** if the agent couldn't finish.

## Development

```bash
pnpm install
pnpm dev          # starts Next.js (port 3001) and Convex backend together
```

Other commands:

```bash
pnpm dev:frontend   # Next.js only
pnpm dev:backend    # Convex only
pnpm build          # production build
pnpm lint           # ESLint
pnpm typecheck      # TypeScript (app + convex)
pnpm test           # Vitest
```

## Project layout

```
app/          Next.js routes and page components
components/   Shared UI components (kanban, primitives)
convex/       Backend — schema, queries, mutations, actions
  integrations/   Sandbox and OpenCode orchestration
  lib/            Helpers (GitHub, sandbox, stream monitor)
```

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Purpose |
|---|---|
| `CONVEX_DEPLOYMENT` | Your Convex deployment URL |
| `NEXT_PUBLIC_CONVEX_URL` | Public Convex URL for the client |
| `CLERK_*` | Clerk auth keys |
| `GITHUB_TOKEN` | GitHub API token for PR creation |
| `DISCORD_WEBHOOK_URL` | (Optional) Status notifications |
