# AGENTS.md: Writedown Coding Agent Instructions

> Repository state at planning time (2026-10-09): `Omar12/writedown` is empty. This file is a **proposed initial instruction document**, not yet committed. If the chosen coding harness uses another instruction format, adapt it without losing the requirements or gates.

## Mission
Implement a distraction-free, local-first Markdown-backed visual editor with user-controlled AI suggestions. Source of truth: [PRD.md](PRD.md), [TECH_SPEC.md](TECH_SPEC.md), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Record evidence in [PROGRESS.md](PROGRESS.md). Never treat proposed architectural defaults as confirmed product decisions.

## Startup each session
1. Read these documents and the task being implemented.
2. Inspect actual repository structure, package scripts, tests, previous commits and CI; the repo may no longer be empty.
3. Check PROGRESS.md for verified completed work and blockers. Do not trust status without evidence.
4. Identify acceptance criteria, files likely impacted, risks, and required tests before editing.
5. If a product decision blocks safe implementation, stop only that task and provide a concise decision request; progress on independent tasks when possible.

## Engineering boundaries
- Smallest coherent change; vertical slices; no speculative refactors or unrequested dependencies.
- Prefer existing conventions once established. Separate editor logic, persistence, suggestion handling and server provider boundaries.
- Keep document content local except for deliberately transmitted bounded AI target/context.
- Never embed API keys, tokens, credentials or user document text in repository, telemetry or client bundles.
- All unaccepted AI suggestions remain separate from Markdown persistence. Never silently replace text.
- Source fingerprints + document identity + live text verification required before accepting a suggestion. Avoid relying only on stale offsets.
- An AI outage cannot block editing, saving or exporting. Fail closed for beta API access.
- Do not add runtime logging of raw content/prompts unless specifically approved with safeguards.
- Accessibility is a feature acceptance gate: keyboard flows, focus, screen-reader labels, noncolor distinctions.

## Task loop (mandatory)
1. **PLAN:** inspect relevant code, confirm task prerequisites and exact verification commands.
2. **IMPLEMENT:** apply narrow changes plus tests.
3. **VALIDATE:** execute applicable checks and capture command/exit status/output summary.
4. **REVIEW:** check every acceptance criterion; test error, empty, loading and stale states; inspect diff for scope creep.
5. **FIX:** correct the diagnosed failure only.
6. **REVALIDATE:** rerun failed checks plus related regression tests.
7. **COMPLETE:** update PROGRESS.md only when evidence exists and required gates pass.

After **three unsuccessful repair attempts for the same failure**, stop the loop, record symptoms, reproduction commands, logs (redacted), attempts, likely cause and suggested next action. Never mark a failed, skipped or unexecuted test as passing.

## Commands
Verified locally on 2026-10-09 (Node 24.8.0, pnpm 9.0.6) and run in CI (`.github/workflows/ci.yml`) on every PR:

```bash
pnpm install --frozen-lockfile
pnpm format:check   # prettier
pnpm lint           # eslint
pnpm typecheck      # tsc (frontend + server)
pnpm test           # vitest unit + component tests (happy-dom)
pnpm build          # vite production build
pnpm test:e2e       # playwright (chromium) + axe; needs `pnpm exec playwright install chromium` once
pnpm dev            # frontend dev server, proxies /api
pnpm dev:api        # Hono API on $PORT (default 8787); reads .env; AI_PROVIDER=fake by default (no network, no cost)
```

`test:integration`: NOT CONFIGURED. Accessibility checks run inside `test:e2e` (axe, WCAG 2.2 A/AA tags, light and dark); there is no separate `test:a11y`. No script needs secrets yet.

## Task status and evidence format
For each WD task, log: task ID, status (`not started | in progress | blocked | complete`), requirement IDs, commit/PR reference if any, commands executed with exit codes, test counts/results, manual verification (browser and environment), limitations, blockers and timestamp. Evidence must be from actual runs, not inferred.

## Review gates
- Editor: no lost supported Markdown semantics across save/import/export.
- Suggestions: no mutation until Accept; atomic undo; stale and overlapping responses cannot apply.
- Background: opt-in only; 3000 ms inactivity after sentence completion; no focus or caret shift.
- API: authentication and allowlist verified server-side, provider key server-side, quotas enforced, request size bounded.
- Private beta: no public access to app functionality or AI API; explicit owner approval before live deployment.

## Operational safety
- Use a feature branch and PR for implementation; keep `main` intact unless explicitly requested.
- No deployment, production payment changes, destructive data migrations or provider calls with billable keys without approval.
- If repository reality conflicts with a plan, update assumptions and cross-references before proceeding.
- For changes to acceptance behavior, get product-owner approval and update PRD, TECH_SPEC, plan and traceability together.
