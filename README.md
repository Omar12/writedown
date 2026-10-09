# writedown

Distraction-free, local-first visual Markdown editor with user-controlled AI suggestions. See [PRD.md](PRD.md), [TECH_SPEC.md](TECH_SPEC.md), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Stack

Vite + React 19 SPA (`src/`), Hono API (`server/`), TypeScript 6, Vitest, ESLint, Prettier. Node 24 (`.nvmrc`), pnpm.

## Setup

```bash
pnpm install
cp .env.example .env   # optional; never commit .env
```

## Scripts

| Command             | What it does                                                      |
| ------------------- | ----------------------------------------------------------------- |
| `pnpm dev`          | Vite dev server (http://localhost:5173), proxies `/api` to the API |
| `pnpm dev:api`      | API server with watch, port `$PORT` (default 8787)               |
| `pnpm build`        | Production frontend build to `dist/`                             |
| `pnpm typecheck`    | `tsc` over frontend and server                                   |
| `pnpm lint`         | ESLint                                                           |
| `pnpm format:check` | Prettier check (`pnpm format` to fix)                            |
| `pnpm test`         | Vitest unit tests                                                |

Run `pnpm dev` and `pnpm dev:api` in two terminals for local development. CI (`.github/workflows/ci.yml`) runs format:check, lint, typecheck, test, and build on every PR.

## Secrets

Provider keys are server-side only and come from the environment (`.env` locally, the host's secret store in deployment). `.env*` is git-ignored except `.env.example`.
