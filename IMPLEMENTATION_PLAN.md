# Writedown: Agent-Ready Implementation Plan

- Version: 1.0 (planning draft), 2026-10-09
- Repository: `Omar12/writedown` (`main`), confirmed empty via GitHub API on 2026-10-09; no commits or source files.
- References: [PRD.md](PRD.md), [TECH_SPEC.md](TECH_SPEC.md), [AGENTS.md](AGENTS.md), [PROGRESS.md](PROGRESS.md)
- Scope: greenfield desktop-first, private-beta AI Markdown editor. All paths are **proposed** until scaffolding exists.

## Execution contract
Every task: PLAN → IMPLEMENT → VALIDATE → REVIEW → FIX → REVALIDATE → COMPLETE. Do not mark complete before actual test results are recorded in PROGRESS.md. At most three targeted repair attempts per recurring failure; then stop and escalate. Deliver narrow vertical slices. No deployment or live credentials without product-owner approval. Open focused PRs; do not push directly to `main` unless owner instructs.

## Phase 0: Eliminate architectural uncertainty

### WD-001: Initialize repository and quality gates
- **Objective:** Establish a minimal runnable TypeScript web application and trustworthy CI.
- **Requirements:** NFR-001, NFR-002, NFR-005, NFR-008; TECH-001.
- **Likely areas:** package manifest, src/app, test config, tooling config, `.github/workflows`, `.env.example`, README (none exist yet).
- **Instructions:** Select one lean project framework/manager after reviewing host needs. Scaffold frontend and server boundary without premature feature logic. Add formatting/lint/typecheck/test/build scripts, error boundary, precommit or CI validation, secret-ignore rules, sample env names. Avoid actual secrets.
- **Dependencies:** empty repository; approve framework if deployment constraints arise.
- **Acceptance:** local homepage runs; scripts are documented; CI checks run on PR; no secret is committed.
- **Tests:** install, typecheck, lint, unit smoke, production build, CI run.
- **DoD:** commands, versions, outcomes and commit SHA recorded; no unrelated setup.

### WD-002: Markdown fidelity spike (technical gate)
- **Objective:** Prove selected editor/parser supports the required formatting before committing architecture.
- **Requirements:** FR-001, FR-002, FR-005; BR-006.
- **Likely areas:** `src/editor`, Markdown fixture corpus, spike report.
- **Instructions:** Use candidate Tiptap/ProseMirror + Markdown conversion. Test headings, emphasis, links, lists/nesting, quotes, inline/fenced code, Unicode, punctuation, hard breaks, escaping, and imported unsupported syntax. Compare parsed semantic documents, not Markdown bytes. Record library version/license and known losses.
- **Dependencies:** WD-001.
- **Acceptance:** fixtures for all supported syntax survive round-trip semantically; any unsupported case has an explicit handling rule. Block editor commitment if core syntax loses meaning.
- **Tests:** deterministic round-trip fixtures, unsafe HTML input.
- **DoD:** executable corpus and evidence, written go/no-go decision.

### WD-003: Safe inline suggestion spike (technical gate)
- **Objective:** Validate nonpersistent diff annotations and stale-response safety.
- **Requirements:** FR-009; BR-001, BR-002, BR-003.
- **Likely areas:** `src/editor/suggestions`, spike tests.
- **Instructions:** Show add/remove diff without mutating durable document, accept as one undoable editor transaction, reject without mutation. Freeze source snapshot, validate current mapped text and boundaries before applying; discard stale after edit, document switch, or conflicting suggestion. Protect cursor/focus.
- **Dependencies:** WD-002.
- **Acceptance:** original Markdown unchanged before accept, correct undo after accept, stale requests cannot apply.
- **Tests:** unit and simulated delayed-response integration tests.
- **DoD:** proof and architectural notes recorded.

## Phase 1: Usable offline-first editor

### WD-004: Visual editor and formatting
- **Objective:** Create the core composition experience.
- **Requirements:** FR-001, FR-002; NFR-001, NFR-002.
- **Likely areas:** editor shell, toolbar, formatting commands, editor unit tests.
- **Instructions:** Implement paragraphs, headings, bold, italic, ordered/unordered lists, links, blockquote, inline/fenced code, undo/redo. Accessible empty state, keyboard navigation and input composition support.
- **Dependencies:** WD-002.
- **Acceptance:** supported formatting works by keyboard and UI; focus is preserved; Markdown serializer reflects edits.
- **Tests:** component/editor unit tests, keyboard/browser smoke, accessibility checks.
- **DoD:** demonstrable writing journey and test evidence.

### WD-005: Local multi-document storage and autosave
- **Objective:** Reliably create, switch, rename, delete, and reopen multiple documents.
- **Requirements:** FR-003, FR-004; NFR-003, NFR-007.
- **Likely areas:** IndexedDB repository/migrations, document list, autosave scheduler, save indicator.
- **Instructions:** Use stable UUIDs; version schema; serialize Markdown; ordered saves and dirty/saving/saved/error states; prevent delayed responses from crossing documents; define multi-tab conflict behavior and surface storage failures.
- **Dependencies:** WD-004.
- **Acceptance:** two documents persist independently over reload; delete requires confirmation; failed writes never show saved; switching cannot replace the wrong document.
- **Tests:** storage integration (including blocked/quota scenarios), delayed-write tests, E2E reload/switch, multi-tab conflict.
- **DoD:** last acknowledged save restored and errors recoverable.

### WD-006: Markdown import and export
- **Objective:** Make browser-local documents portable.
- **Requirements:** FR-005; BR-005, BR-006.
- **Likely areas:** import/export service, file action UI.
- **Instructions:** Accept `.md`, validate size/encoding, create new document on import, preserve code and URLs, safely handle unsupported constructs; sanitize export filename. Never execute imported HTML.
- **Dependencies:** WD-002, WD-005; DOC-001 owner confirmation.
- **Acceptance:** fixtures round-trip semantically, import does not overwrite existing documents, export works during AI outage.
- **Tests:** unit fixtures, malicious HTML, E2E download/import.
- **DoD:** portable files validated and unsupported format policy documented.

## Phase 2: Explicit AI assistance

### WD-007: Authenticated AI boundary and provider adapter
- **Objective:** Protect hosted model usage and standardize AI responses.
- **Requirements:** FR-008, FR-011, FR-012; BR-007; NFR-005, NFR-006, NFR-009.
- **Likely areas:** server route, authentication/allowlist adapter, provider adapter, request/response schema, environment docs.
- **Instructions:** Implement request validation, session+allowlist check, rate/usage quotas, bounded text and outputs, timeout, stable error codes, request IDs, metadata-only logs. One provider initially via swappable interface. Never expose API keys in browser, log prompts, or accept model-generated HTML.
- **Dependencies:** WD-001; SEC-001, SEC-002, OPS-001 approvals before public network access.
- **Acceptance:** non-allowlisted callers receive 403, anonymous 401, oversized 413, rate-limited 429; malformed provider output rejected; editor remains usable during outage.
- **Tests:** API contract integration with mocked model, auth/rate-limit/security tests; secrets scan.
- **DoD:** all mandatory security checks verified, deployment secret mechanism documented.

### WD-008: Context resolution and keyboard AI menu
- **Objective:** Invoke four actions on the intended text without disrupting writing.
- **Requirements:** FR-006, FR-007, FR-008; UX-001.
- **Likely areas:** selection/sentence resolver, command menu, shortcut handlers, custom prompt dialog.
- **Instructions:** Prefer selection otherwise caret sentence; reject ambiguous/empty/code-only targets; snapshot target and bounded context; keyboard menu for proofread/expand/rewrite/custom, with focus restoration. Treat Meta+J/Ctrl+J as preference pending compatibility testing; ship a clickable alternative and working fallback.
- **Dependencies:** WD-004, WD-007; shortcut resolution.
- **Acceptance:** selection priority; one action per invocation; no API request upon merely opening menu; custom instruction required; Esc returns focus; reserved shortcut has fallback.
- **Tests:** target unit cases (Unicode/abbreviations), keyboard E2E across required browsers, API request contract.
- **DoD:** full explicit invocation demonstrated with mock and authorized backend.

### WD-009: Suggestion review and application
- **Objective:** Turn provider output into safe inline non-destructive review.
- **Requirements:** FR-009; BR-001 to BR-004, BR-008, BR-009.
- **Likely areas:** suggestion state, diff rendering, accept/reject controls, stale-result guard.
- **Instructions:** Separate transient annotations from Markdown. Highlight inserted/deleted spans in accessible markup. Validate source identity and text before accept. One undoable atomic accept, rejection removes annotations. No stale response on document change or after edits.
- **Dependencies:** WD-003, WD-007, WD-008.
- **Acceptance:** source unchanged until accept; reject no change; stale responses discarded; screen reader labels convey edits; save occurs after accept only.
- **Tests:** diff unit tests, race-condition integration, keyboard E2E, accessibility.
- **DoD:** user can complete full proofread accept/reject journey.

## Phase 3: Passive assistance and beta hardening

### WD-010: Opt-in silent proofreading
- **Objective:** Offer sentence-level proofreading three seconds after qualifying inactivity.
- **Requirements:** FR-010; BR-002, BR-003, BR-007; NFR-006.
- **Likely areas:** sentence detector, debounce scheduler, background queue, subtle annotation UI.
- **Instructions:** Disabled by default; sentence-terminal punctuation and suitable boundary required; ignore IME/incomplete sentences; debounce 3000ms; cancel on resumed edits, context change or disable; dedupe content per session, cap concurrency, suppress while quota-limited. No popup/caret change.
- **Dependencies:** WD-009.
- **Acceptance:** no request before idle threshold or while disabled; eligible sentence triggers once; delayed result cannot target edited text; opt-out cancels queued work.
- **Tests:** fake-clock unit tests, IME/race integration, focus E2E, 429 suspension.
- **DoD:** live typing flow verified with deterministic tests.

### WD-011: Quality, accessibility, reliability and privacy gate
- **Objective:** Meet MVP nonfunctional targets and close high-impact risks.
- **Requirements:** NFR-001 to NFR-009; BR-001 to BR-009.
- **Likely areas:** all modules, QA fixtures, CI workflows, documentation.
- **Instructions:** Run full browser journey tests, keyboard/zoom/a11y manual checklist, 25k-word responsiveness fixture, AI outage and IndexedDB failure scenarios, secrets scan, privacy disclosure, request logging review. Fix only evidence-backed defects.
- **Dependencies:** WD-004 through WD-010.
- **Acceptance:** required acceptance matrix recorded with no blocking regressions; unresolved issues documented.
- **Tests:** typecheck, lint, unit, integration, E2E, build, a11y, security, manual cross-browser.
- **DoD:** traceability and reproducible evidence in PROGRESS.md.

### WD-012: Private-beta deployment and smoke verification
- **Objective:** Deliver an authorized hosted beta without opening unrestricted AI endpoints.
- **Requirements:** FR-011, FR-012; NFR-005 to NFR-009.
- **Likely areas:** hosting config, production environment, smoke checklist, runbook.
- **Instructions:** Confirm hosting/domain, identity allowlist, provider privacy and budget, production secret injection. Deploy via approved mechanism. Verify unauthenticated denial, authorized login, create/edit/save/reload/export, AI accept/reject, and outage recovery in hosted environment.
- **Dependencies:** WD-011; owner approval on SEC-001, SEC-002, OPS-001 and deployment.
- **Acceptance:** all smoke checks executed in hosted environment; no auth bypass; costs bounded.
- **Tests:** post-deploy smoke, access control negative tests and rollback drill.
- **DoD:** release URL, revision, test results, known limits and rollback procedure recorded.

## Milestone gates and ordering
- **M0 (WD-001 to WD-003):** verified toolchain, Markdown fidelity and safe diff design. No AI functionality yet.
- **M1 (WD-004 to WD-006):** fully functional local editor independent of AI.
- **M2 (WD-007 to WD-009):** authenticated manual AI and controlled suggestion acceptance.
- **M3 (WD-010 to WD-012):** optional automatic proofreading and private beta.
- **Gate after each milestone:** verify end-to-end journey, regressions, scope, technical debt and requirement-to-test evidence. Seek owner decisions on unresolved blockers.

## Requirements-to-tests map
| Requirement(s) | Primary tasks | Minimum evidence |
|---|---|---|
| FR-001, FR-002, BR-006 | WD-002, WD-004 | Markdown corpus, edit/undo E2E |
| FR-003, FR-004 | WD-005 | IndexedDB integration, reload and conflict E2E |
| FR-005 | WD-006 | Import/export round-trip, unsafe input |
| FR-006, FR-007 | WD-008 | Keyboard and locale sentence tests |
| FR-008, FR-011, FR-012 | WD-007, WD-008 | Auth and API contract tests |
| FR-009, BR-001, BR-002 | WD-003, WD-009 | Stale response, accept/reject, undo tests |
| FR-010, BR-003 | WD-010 | Fake-timer and focus tests |
| NFR-001 to NFR-009 | WD-011, WD-012 | Performance, accessibility, security and smoke records |

## Decisions needing owner approval
- **DOC-001:** explicitly include Markdown import/export as a P0 item (assumed yes).
- **SEC-001:** private-beta identity mechanism and invite allowlist.
- **SEC-002:** numeric per-user/global AI quotas and spending limits.
- **UX-001:** browser-tested shortcut fallback (Ctrl+J is commonly reserved for Downloads).
- **OPS-001:** provider retention/privacy disclosure and hosted production settings.
- **TECH-002:** hosting platform and package/runtime versions after WD-001 research.
