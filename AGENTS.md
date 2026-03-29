# AGENTS.md

## Project Overview

- Frameworks: Next.js 16 (App Router), React 19, TypeScript, Convex, Tailwind CSS v4.
- Backend: Convex functions and schema in `convex/`.
- Frontend: routes/components in `app/` and `components/`.
- Generated Convex artifacts: `convex/_generated/*` (do not hand-edit).

## Commands

- `pnpm dev` -> starts frontend and backend together.
- `pnpm dev:frontend` -> runs `next dev`.
- `pnpm dev:backend` -> runs `convex dev`.
- `pnpm build` -> runs `next build`.
- `pnpm start` -> runs `next start`.
- `pnpm lint` -> `eslint . --ignore-pattern "convex/_generated/**"`
- `pnpm exec eslint app/page.tsx` -> lint one file manually.
- `pnpm exec eslint app convex` -> lint a directory manually.
- `pnpm exec convex dev` -> local Convex development.
- `pnpm exec convex dashboard` -> open Convex dashboard.
- `pnpm exec convex -h` -> CLI help.
- `pnpm test <test-path-or-pattern>` -> typical single-test pattern once a test runner is added.

## Practical validation before handoff

- Always run: `pnpm lint`
- Run for runtime-impacting edits: `pnpm build`
- For Convex function/schema edits, verify `pnpm dev:backend` starts cleanly.

## Code Style Guidelines

### Naming conventions

- Components: `PascalCase`.
- Variables/functions/hooks: `camelCase`.
- Constants: `UPPER_SNAKE_CASE` only when truly constant.
- Convex function names should be descriptive and behavior-focused.
- Follow Next.js file conventions (`page.tsx`, `layout.tsx`, etc.).

### State and data flow

- Keep temporary UI state local unless sharing is necessary.
- Prefer Convex reactive hooks (`useQuery`, `useMutation`, `usePreloadedQuery`) in client components.
- Keep backend contracts stable and explicit.

### Convex Guidelines

- Use object-form Convex registration syntax (`query({ ... })`, `mutation({ ... })`, etc.).
- Include validators for arguments and return values on Convex functions.
- Use `returns: v.null()` when the function returns `null`.
- Use `query`/`mutation`/`action` for public APIs.
- Use `internalQuery`/`internalMutation`/`internalAction` for private APIs.
- Use `api` and `internal` function references for calls.
- Prefer indexed queries (`withIndex`) rather than filter-heavy scans.
- Use `v.int64()` (not deprecated `v.bigint()`).
- For Node-runtime actions, add `"use node"`.
- Do not use `ctx.db` directly inside actions.

### Convex backend patterns

- Keep schema definitions in `convex/schema.ts`.
- Use validators from `convex/values` for Convex function arguments and returns.
- Use generated API references from `convex/_generated/api` when calling functions.
- Queries/mutations own DB access; actions are for orchestration/external I/O.
- Never manually edit `convex/_generated/*`.

## Guidelines

- Do not commit secrets from `.env*` files.
- Preserve lint ignore behavior for generated Convex files unless intentionally changing tooling.
- Read nearby files before editing to match local patterns.
- If uncertain, choose consistency with existing code over novelty.

<!-- opensrc:start -->

## Source Code Reference

Source code for dependencies is available in `opensrc/` for deeper understanding of implementation details.

See `opensrc/sources.json` for the list of available packages and their versions.

Use this source code when you need to understand how a package works internally, not just its types/interface.

### Fetching Additional Source Code

To fetch source code for a package or repository you need to understand, run:

```bash
npx opensrc <package>           # npm package (e.g., npx opensrc zod)
npx opensrc pypi:<package>      # Python package (e.g., npx opensrc pypi:requests)
npx opensrc crates:<package>    # Rust crate (e.g., npx opensrc crates:serde)
npx opensrc <owner>/<repo>      # GitHub repo (e.g., npx opensrc vercel/ai)
```

<!-- opensrc:end -->

<!-- BEGIN:nextjs-agent-rules -->
 
# Next.js: ALWAYS read docs before coding
 
Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.
 
<!-- END:nextjs-agent-rules -->