# PROGRESS.md: Writedown Delivery Tracker

- Snapshot date: 2026-10-09
- Repo: `https://github.com/Omar12/writedown`
- Repository observation: `main` exists as GitHub default branch label, but repository is empty (size 0); contents returned GitHub 404 "repository is empty" and commit listing returned 409 "Git Repository is empty".
- WD-001 merged (PR #1). WD-002 merged (PR #2). WD-003 complete on branch `wd-003-suggestion-spike`.

## Milestone status
| Milestone | Tasks | Status | Evidence |
|---|---|---|---|
| M0 Foundation and spikes | WD-001 to WD-003 | Complete | PRs #1, #2 merged; WD-003 PR open |
| M1 Offline editor | WD-004 to WD-006 | Not started | None |
| M2 Explicit AI | WD-007 to WD-009 | Not started | None |
| M3 Auto proofreading and beta | WD-010 to WD-012 | Not started | None |

## Task status
| Task | Title | Status | Validation evidence |
|---|---|---|---|
| WD-001 | Repository/toolchain/CI initialization | Complete | Local gates exit 0; CI run 38003203895 pass |
| WD-002 | Markdown fidelity spike | Complete | 29/29 tests pass; GO decision in TECH_SPEC §4 |
| WD-003 | Inline suggestion safety spike | Complete | 23 suggestion + 9 diff tests pass (61 total); GO in TECH_SPEC §6 |
| WD-004 | Visual editor and formatting | Not started | Not executed |
| WD-005 | Multi-document storage and autosave | Not started | Not executed |
| WD-006 | Markdown import/export | Not started | Not executed |
| WD-007 | Authenticated AI service boundary | Not started | Not executed |
| WD-008 | Context resolution and AI menu | Not started | Not executed |
| WD-009 | Inline AI suggestions | Not started | Not executed |
| WD-010 | Opt-in auto proofreading | Not started | Not executed |
| WD-011 | Quality/accessibility/security gate | Not started | Not executed |
| WD-012 | Hosted private beta | Not started | Not executed |

## Evidence log
| Date/time | Task | Command/check | Result | Source | Notes |
|---|---|---|---|---|---|
| 2026-10-09 | Repo inspection | GitHub repository metadata | Success | GitHub connector | public; empty; no app files |
| 2026-10-09 | Repo inspection | GitHub repository contents | 404 empty repository | GitHub connector | Expected for uninitialized repo |
| 2026-10-09 | Repo inspection | GitHub commit listing | 409 empty Git repository | GitHub connector | No commits available |
| 2026-10-09 | WD-001 | `pnpm format:check` / `lint` / `typecheck` / `build` | exit 0 each | Local, Node 24.8.0, pnpm 9.0.6 | Commit 490d3e5 |
| 2026-10-09 | WD-001 | `pnpm test` | exit 0, 2/2 passed | Local | `server/app.test.ts` health + 404 |
| 2026-10-09 | WD-001 | `pnpm dev` + `node server/index.ts`, curl `/` and `/api/health` | Homepage served; proxy returned `{"status":"ok"}` | Local | Manual smoke |
| 2026-10-09 | WD-002 | `pnpm format:check` / `lint` / `typecheck` / `build` | exit 0 each | Local | Branch wd-002-markdown-spike |
| 2026-10-09 | WD-002 | `pnpm test` | exit 0, 29/29 passed (3 files) | Local | 16 round-trip fixtures, 7 unsupported-syntax cases, 2 unsafe-HTML tests |
| 2026-10-09 | WD-003 | `pnpm format:check` / `lint` / `typecheck` / `build` | exit 0 each | Local | Branch wd-003-suggestion-spike |
| 2026-10-09 | WD-003 | `pnpm test` | exit 0, 45/45 passed (4 files) | Local | 16 new suggestion tests in happy-dom |
| 2026-10-09 | WD-003 | Mutation: verification disabled | 3 tests fail as expected; file restored | Local | Confirms stale guard coverage |
| 2026-10-09 | WD-003 | `pnpm test` after formatting/history follow-up | exit 0, 61/61 passed (5 files); format:check/lint/typecheck/build exit 0 | Local | Mutation: whole-range accept fails 3 formatting tests |
| 2026-10-09 | WD-001 | GitHub Actions CI on PR #1 | pass (20s) | https://github.com/Omar12/writedown/actions/runs/38003203895 | ubuntu-latest |

## Open decisions
| ID | Decision | Proposed answer | Gate | Status |
|---|---|---|---|---|
| DOC-001 | Markdown import/export P0 | Include; unsupported syntax shows a warning | WD-006 | Confirmed by owner 2026-10-09 |
| SEC-001 | Private-beta auth | Managed sign-in plus server-side allowlist | WD-007 / WD-012 | Open |
| SEC-002 | Hosted AI budgets | Per-user and global configurable limits | WD-007 / WD-012 | Open |
| UX-001 | Shortcut mapping | Browser test Meta+J; fallback for Ctrl+J | WD-008 | Open |
| OPS-001 | Privacy/retention | Confirm provider settings and disclosure | WD-007 / WD-012 | Open |
| TECH-002 | Hosting and runtime | Runtime: Vite + React + Hono, pnpm (owner-approved 2026-10-09). Hosting still open | WD-012 | Partially resolved |

## WD-001 record
- Status: complete. Requirements: NFR-001, NFR-002, NFR-005, NFR-008, TECH-001.
- Versions: React 19.3, Vite 8.3, Hono 4.13, TypeScript 6.0.3 (pinned below 7: typescript-eslint 8.71 peer range is <6.1), Vitest 5.0, ESLint 10.
- Limitations: no frontend unit test (jsdom/testing-library deferred to WD-004); no production server serving `dist/` (hosting undecided); `test:integration`, `test:e2e`, `test:a11y` not configured.

## WD-002 record
- Status: complete. Decision: GO on Tiptap 3.31.4 + `@tiptap/markdown` (see TECH_SPEC §4 "WD-002 spike result").
- Requirements: FR-001, FR-002, FR-005; BR-006.
- Changed files: `src/editor/markdown.ts`, `src/editor/markdown.test.ts`, `src/editor/markdown.dom.test.ts`, package.json/lockfile, TECH_SPEC.md, PROGRESS.md.
- Limitations: browser HTML handling verified under happy-dom, not a real browser yet (WD-011 browser smoke). The corpus tests the converter, not the interactive editor (WD-004).
- Repair attempts: one each for code-in-link, nested fences and footnote detection. All three fixed.

## WD-003 record
- Status: complete. Decision: GO (see TECH_SPEC §6 "WD-003 spike result").
- Requirements: FR-009; BR-001, BR-002, BR-003.
- Changed files: `src/editor/suggestions.ts`, `src/editor/suggestions.test.ts`, `src/editor/diff.ts`, `src/editor/diff.test.ts`, TECH_SPEC.md, PROGRESS.md.
- Follow-up (owner request): Accept preserves formatting on unchanged words (word diff), and each Accept records the original content with its marks in session history.
- Acceptance: Markdown unchanged before accept (tested); one undo restores the original after accept (tested); stale requests cannot apply after an edit inside the target, deletion, document switch or a newer overlapping request (tested); reordered delayed responses apply correctly (tested); caret is not moved by a response (tested).
- Mutation checks: disabling the live-text verification makes 3 stale-response tests fail. Reverting Accept to whole-range replacement makes 3 formatting tests fail.
- Limitations: tests run in happy-dom, not a real browser. Single-textblock targets only. No token-level diff yet (WD-009). Screen-reader announcement of `<ins>`/`<del>` is not yet verified manually (WD-011).
- Repair attempts: 1 (test-side: an insert landed on the exclusive range edge; the test was wrong, not the code).

## Current blockers
- Nothing blocks writing the specifications or initializing non-billable local scaffolding.
- Live hosted AI and private-beta deployment are blocked on SEC-001, SEC-002, OPS-001.
- Final shortcut acceptance depends on UX-001 browser verification.

## Update template
```text
Task: WD-###
Date / commit / PR:
Status:
Requirement IDs:
Changed files:
Acceptance checks:
Executed validations: <exact command>, exit code, results
Manual checks: <environment/browser>, result
Known limitations / security concerns:
Repair attempt count for any failure:
Next action:
```
