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
| `pnpm test`         | Vitest unit and component tests                                  |
| `pnpm test:e2e`     | Playwright browser tests + axe scan (Chromium; run `pnpm exec playwright install chromium` once) |

Run `pnpm dev` and `pnpm dev:api` in two terminals for local development. The API defaults to a fake AI provider; set `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` in `.env` to call Claude. Sign-in links print to the API console in development (add your email to `ALLOWLIST`). CI (`.github/workflows/ci.yml`) runs format:check, lint, typecheck, test, build, and test:e2e on every PR.

## Editor keyboard

Standard shortcuts (Mod = ⌘ on macOS, Ctrl elsewhere): Mod+B bold, Mod+I italic, Mod+E inline code, Mod+K link, Mod+Alt+1–3 headings, Mod+Shift+7/8 lists, Mod+Shift+B quote, Mod+Alt+C code block, Mod+Z / Mod+Shift+Z undo/redo. Alt+F10 moves focus to the toolbar; arrow keys move within it; Escape returns to the text.

## Secrets

Provider keys are server-side only and come from the environment (`.env` locally, the host's secret store in deployment). `.env*` is git-ignored except `.env.example`.
