# PROGRESS.md: Writedown Delivery Tracker

- Snapshot date: 2026-10-09
- Repo: `https://github.com/Omar12/writedown`
- Repository observation: `main` exists as GitHub default branch label, but repository is empty (size 0); contents returned GitHub 404 "repository is empty" and commit listing returned 409 "Git Repository is empty".
- M0 and M1 merged (PRs #1–#6). WD-007 complete on branch `wd-007-ai-service`.

## Milestone status
| Milestone | Tasks | Status | Evidence |
|---|---|---|---|
| M0 Foundation and spikes | WD-001 to WD-003 | Complete | PRs #1–#3 merged |
| M1 Offline editor | WD-004 to WD-006 | Complete | PRs #4–#6 merged |
| M2 Explicit AI | WD-007 to WD-009 | In progress | WD-007 complete |
| M3 Auto proofreading and beta | WD-010 to WD-012 | Not started | None |

## Task status
| Task | Title | Status | Validation evidence |
|---|---|---|---|
| WD-001 | Repository/toolchain/CI initialization | Complete | Local gates exit 0; CI run 38003203895 pass |
| WD-002 | Markdown fidelity spike | Complete | 29/29 tests pass; GO decision in TECH_SPEC §4 |
| WD-003 | Inline suggestion safety spike | Complete | 23 suggestion + 9 diff tests pass (61 total); GO in TECH_SPEC §6 |
| WD-004 | Visual editor and formatting | Complete | 83 unit/component tests + 3 Chromium e2e (incl. axe) pass |
| WD-005 | Multi-document storage and autosave | Complete | 104 unit + 8 Chromium e2e pass |
| WD-006 | Markdown import/export | Complete | 124 unit + 14 Chromium e2e pass |
| WD-007 | Authenticated AI service boundary | Complete | 44 server tests pass (166 total); live curl flow verified |
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
| 2026-10-09 | WD-004 | `pnpm format:check` / `lint` / `typecheck` / `build` | exit 0 each | Local | Branch wd-004-visual-editor |
| 2026-10-09 | WD-004 | `pnpm test` | exit 0, 83/83 passed (6 files) | Local | 22 new component tests |
| 2026-10-09 | WD-004 | `pnpm test:e2e` | exit 0, 3/3 passed | Local Chromium headless shell 156 | Keyboard journey, bubble menu, axe (no serious/critical, light + dark) |
| 2026-10-09 | WD-004 | Visual screenshots light/dark | Reviewed | Local Chromium | Toolbar, bubble menu, link box render correctly |
| 2026-10-09 | WD-005 | `pnpm format:check` / `lint` / `typecheck` / `build` | exit 0 each | Local | Branch wd-005-local-documents |
| 2026-10-09 | WD-005 | `pnpm test` | exit 0, 104/104 passed (8 files) | Local | IndexedDB via fake-indexeddb; autosave via fake timers |
| 2026-10-09 | WD-005 | `pnpm test:e2e` | exit 0, 8/8 passed | Local Chromium | Reload, switch, delete, multi-tab scrim, quota failure, conflict |
| 2026-10-09 | WD-006 | `pnpm format:check` / `lint` / `typecheck` / `build` | exit 0 each | Local | Branch wd-006-import-export |
| 2026-10-09 | WD-006 | `pnpm test` | exit 0, 124/124 passed (9 files) | Local | 20 new (file validation, filenames, unsafe links, malicious HTML) |
| 2026-10-09 | WD-006 | `pnpm test:e2e` | exit 0, 14/14 passed | Local Chromium | 6 new: import (picker, drop, warn/cancel, invalid), export (menu, shortcut, rescue) |
| 2026-10-09 | WD-007 | `pnpm format:check` / `lint` / `typecheck` / `build` / `test:e2e` | exit 0 each | Local | Branch wd-007-ai-service |
| 2026-10-09 | WD-007 | `pnpm test` | exit 0, 166/166 passed (11 files) | Local | 44 new server tests (auth, route contract, Claude adapter with stub client) |
| 2026-10-09 | WD-007 | Live curl flow against `node server/index.ts` (fake provider) | All expected statuses | Local | 202/200/303/200/200/401/403 |
| 2026-10-09 | WD-001 | GitHub Actions CI on PR #1 | pass (20s) | https://github.com/Omar12/writedown/actions/runs/38003203895 | ubuntu-latest |

## Open decisions
| ID | Decision | Proposed answer | Gate | Status |
|---|---|---|---|---|
| DOC-001 | Markdown import/export P0 | Include; unsupported syntax shows a warning | WD-006 | Confirmed by owner 2026-10-09 |
| SEC-001 | Private-beta auth | Email magic links + server-side allowlist (owner 2026-10-09). Email delivery provider still to choose | WD-012 | Resolved (mail provider open) |
| SEC-002 | Hosted AI budgets | 100 requests/user/day, $10/month global (owner 2026-10-09; "per day" assumed) | WD-007 | Resolved |
| UX-001 | Shortcut mapping | Browser test Meta+J; fallback for Ctrl+J | WD-008 | Open |
| HIST-001 | Persist suggestion history | Saved with the document in a separate store, never exported. "Restore original" action not requested | WD-005 | Resolved by owner 2026-10-09 |
| OPS-001 | Privacy/retention | Confirm Anthropic data-retention settings and the in-app disclosure | WD-012 | Open |
| AI-001 | Model per task | Haiku 5.5 for proofreading, Sonnet 5.5 for rewrite/expand/custom (see TECH_SPEC §8) | WD-007 | Proposed; owner asked for a recommendation |
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

## WD-004 record
- Status: complete. Requirements: FR-001, FR-002; NFR-001, NFR-002.
- Owner decisions (2026-10-09): fixed toolbar plus selection bubble menu; minimal look that follows the system light/dark setting; small inline link box.
- Changed files: `src/editor/{commands.ts,Toolbar.tsx,LinkBox.tsx,WritingEditor.tsx,WritingEditor.test.tsx,markdown.ts}`, `src/App.tsx`, `src/main.tsx`, `src/index.css`, `e2e/editor.spec.ts`, `playwright.config.ts`, `vite.config.ts`, `tsconfig.json`, CI, README, AGENTS.md.
- Behavior: all supported formatting is available from the toolbar and by keyboard shortcut. Toolbar follows the WAI-ARIA pattern (one tab stop, arrows/Home/End, Escape back to the text, Alt+F10 from the text), with `aria-pressed` state and `aria-keyshortcuts`. Clicking a toolbar button keeps editor focus and selection. The link box is opened with Mod+K; it adds https:// to bare domains, rejects javascript:/data:/vbscript:, and returns focus to the text. The empty state has a labelled textbox and a placeholder.
- Bugs found and fixed: (1) an empty document had no paragraph, leaving nothing to type into; (2) disabled undo/redo used `disabled`, which removed them from toolbar keyboard navigation, so they now use `aria-disabled`; (3) the editor's trailing empty paragraph serialized as extra blank lines.
- Limitations: e2e runs on Chromium only (Firefox/WebKit/Edge in WD-011). IME composition relies on ProseMirror's native handling and is not yet tested with a real IME. Screen-reader spot-check is not yet done. Pasted rich text is normalized by the schema but has no dedicated test.
- Repair attempts: Mod-K component test 3 (cause: a string replace silently missed after Prettier reformatted the file); bubble e2e 1 (Shift+Home doesn't select on macOS Chromium).

## WD-005 record
- Status: complete. Requirements: FR-003, FR-004; NFR-003, NFR-007.
- Owner decisions (2026-10-09): switcher menu in the toolbar row; title from the first line; multi-tab = warning plus a scrim on the inactive tab; history saved beside the document and not exported.
- Changed files: `src/documents/{db.ts,autosave.ts,tabs.ts,useWorkspace.ts,DocumentSwitcher.tsx,SaveStatus.tsx}` and tests, `src/editor/{WritingEditor.tsx,suggestions.ts}`, `src/App.tsx`, `src/index.css`, `e2e/{documents,editor}.spec.ts`, TECH_SPEC.md.
- Acceptance: two documents persist independently over reload (e2e); delete requires confirmation (e2e); failed writes never show Saved and recover via Retry (unit + e2e with an injected QuotaExceededError); switching flushes and never writes to the wrong document (unit + e2e); a stale save warns instead of overwriting (unit + e2e without BroadcastChannel); a second tab shows the scrim and can take the document back (e2e).
- Bugs found and fixed: (1) Tiptap `setEditable` emitted an update, so a tab being blocked saved and caused a false conflict in the other tab; (2) the switcher and scrim showed the stale title until reload; (3) a synchronous `put` failure surfaced as an uncaught error (now aborts the transaction and rejects).
- Not done: rename is implicit (edit the first line), not a separate action. "Delete" has no undo. Firefox/WebKit not yet run (WD-011). Export as a backup arrives in WD-006, so the storage-error banner can't offer export yet.
- Process note: string-replace edits twice silently missed after Prettier reformatted a file. The db.ts fix was later applied with the Edit tool and verified.

## WD-006 record
- Status: complete. Requirements: FR-005; BR-005, BR-006.
- Owner decisions (2026-10-09): import from both the switcher and drag-and-drop; warn *before* import; export from the switcher plus a shortcut; "Couldn't save" offers export as a rescue.
- Changed files: `src/documents/{markdownFile.ts,markdownFile.test.ts,ImportDialog.tsx,DocumentSwitcher.tsx,SaveStatus.tsx,useWorkspace.ts}`, `src/editor/{markdown.ts,markdown.test.ts,WritingEditor.tsx}`, `src/App.tsx`, `src/index.css`, `e2e/import-export.spec.ts`, TECH_SPEC.md.
- Acceptance: fixtures round-trip semantically (WD-002 corpus + import round-trip test); import never overwrites (unit + e2e); malicious HTML and javascript: links never become markup or run (unit + e2e); filename sanitized (9 cases); export works with no network dependency, including unsaved edits and from the save-error message (e2e).
- Security fix: `[x](javascript:…)` previously parsed into a live link; unsafe link schemes are now removed on parse.
- Accessibility fix: export from the switcher left focus on the page body; focus now returns to the text with the selection intact.
- Known gap: after opening or creating a document from the switcher, focus isn't moved into the new editor. An autofocus attempt broke component tests and was reverted. Track for WD-011.
- Repair attempts: export e2e 2 (focus loss, a real bug; then a wrong test expectation, since bold was still active at the caret).

## WD-007 record
- Status: complete. Requirements: FR-008, FR-011, FR-012; BR-007; NFR-005, NFR-006, NFR-009.
- Changed files: `server/{config,store,auth,app,index,testing}.ts`, `server/ai/{types,anthropic,route}.ts` and tests, `.env.example`, `.gitignore`, package.json, TECH_SPEC.md.
- Acceptance: anonymous 401, non-allowlisted 403, oversized 413, rate/budget 429, malformed provider output 502, timeouts 504, outage 503 (all tested); the editor and export don't depend on the API (WD-005/006 e2e unchanged and passing).
- Mutation checks: disabling the allowlist re-check fails 2 tests; disabling the budget reservation fails 1.
- Live check: local server with the fake provider; magic link → confirm page → POST → HttpOnly cookie → `/me` → suggest 200; anonymous 401; cross-origin 403; log line metadata-only.
- Not done / needs owner: no real Claude call has been made (no key; the adapter is tested against a stubbed SDK client). Email delivery provider not chosen (production refuses sign-in). The "100 requests" limit is assumed per day. The Anthropic retention setting and disclosure (OPS-001) are still open. No sign-in UI yet (arrives with the AI menu in WD-008).
- Secrets: `git grep` over staged files found no keys; `.env`, `*.db` ignored.

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
