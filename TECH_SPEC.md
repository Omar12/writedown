# AI Markdown Editor: Technical Specification

- **Version:** 1.0 (provisional architecture)
- **Date:** 2026-10-09
- **Status:** Draft; not a repository-verified implementation contract
- **Source of product truth:** [PRD.md](PRD.md)
- **Delivery references:** [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), [AGENTS.md](AGENTS.md), [PROGRESS.md](PROGRESS.md)
- **Repository verification (2026-10-09):** `Omar12/writedown` is empty with no commits or files; all architectural directories below are proposed.

## 1. Architecture decision status
**Confirmed:** hosted website, desktop-first, local browser documents, hosted AI, private beta, single initial AI provider behind a replaceable abstraction, non-destructive suggestions.

**Recommended, not selected:** React + TypeScript frontend; Tiptap/ProseMirror editor; local Markdown parser/serializer; IndexedDB storage; TypeScript backend/API; managed identity provider; managed hosting; OpenAI as initial AI integration.

**Unresolved release decisions:** authentication scheme/identity system (SEC-001), limits/cost budget (SEC-002), browser shortcut fallback (UX-001), repository constraints (TECH-001: confirmed greenfield), legal/privacy requirements (OPS-001). Do not hardcode vendor-specific choices before inspection and approval.

## 2. System context
```text
Desktop browser
  ├── Visual editor (internal ProseMirror-style document)
  │     ├── Markdown importer/exporter
  │     ├── Selection/sentence resolver
  │     ├── Suggestions and review UI (separate from source text)
  │     └── Document repository (IndexedDB)
  └── Authenticated AI client
        └── Small server API
              ├── session validation + allowlist
              ├── schema validation + request budgets + rate limits
              ├── provider adapter
              └── hosted model provider
```
No server copy of document bodies is required in the MVP. Authentication identity/usage counters can live on the server; document content stays client-side except deliberately sent bounded text in AI requests.

## 3. Frontend module boundaries (suggested, not existing paths)
- `editor/`: editor setup, portable Markdown schema and commands, keyboard/selection integration.
- `documents/`: IndexedDB repository, document list, metadata, autosave, import/export, save status.
- `ai/`: target selection, request orchestration, provider API client, suggestion state, diff computation, stale-result protection, auto-proofreading scheduler.
- `ui/`: shell, toolbar/command menu, suggestion overlays, alerts, settings, keyboard accessibility.
- `shared/`: schemas/types, validation, tracing and error classifications.

These are conceptual areas, not asserted repository files or required directory names.

## 4. Editor model and Markdown
**Recommended strategy:** ProseMirror-based structured editor state for interactive operations; Markdown string as durable serialization in IndexedDB and `.md` import/export. Ensure serialization occurs on committed save; do not continuously reparse Markdown on every keystroke.

**Supported syntax:** paragraphs, ATX headings, emphasis/strong, links, unordered/ordered lists, blockquotes, inline code, fenced code blocks, and hard breaks. Document exact behavior for nested lists, escaping, empty trailing paragraphs, links and code languages. Unsupported features must be rejected with an import warning or safely preserved as literal text. Do not render unsafe imported HTML as executable DOM.

**Validation spike before commitment:** verify Tiptap Markdown parser/serializer license/version/API; run a fixture-based round-trip corpus; confirm visual editor extensions have matching Markdown serializers; test soft/hard breaks, nested marks, link punctuation, Unicode and multi-paragraph selections. Tiptap documents that Markdown representation has limits and should not be treated as lossless rich-text conversion (https://tiptap.dev/docs/editor/markdown).

### WD-002 spike result (2026-10-09): GO
Editor: Tiptap 3.31.4 (`@tiptap/core`, `@tiptap/starter-kit`, `@tiptap/markdown`, `@tiptap/pm`, `@tiptap/extension-code`, `@tiptap/extension-code-block`), all MIT. `@tiptap/markdown` parses with `marked` 17 (MIT). Owner approved Tiptap on 2026-10-09. Implementation: `src/editor/markdown.ts`; corpus: `src/editor/markdown.test.ts`, `src/editor/markdown.dom.test.ts`.

- **Round-trip:** every supported construct above, plus nesting, Unicode, escaping, link punctuation and hard breaks, survives parse → serialize → parse with an identical editor document. Bytes are not preserved: `_i_` becomes `*i*`, and a backslash hard break becomes two trailing spaces.
- **Upstream defects fixed locally:** (1) the code mark excluded all other marks, so `` [`x`](url) `` produced a schema-invalid document. It now excludes nothing. (2) The code block serializer always used a ``` fence, which corrupted code that contains ```. It now picks a fence longer than the longest backtick run.
- **Also enabled:** strikethrough and horizontal rule. They are outside the list but round-trip losslessly. Underline is disabled because it has no Markdown syntax.
- **Unsupported-syntax policy (owner decision: warn):** `parseMarkdown` returns `warnings` for `table`, `html`, `image`, `footnote` and `taskList`. Observed losses without the warning: tables are dropped entirely, images become bare alt text, footnotes become a bogus link, and task items lose their checkbox. WD-006 must show these warnings to the user on import.
- **Empty and trailing paragraphs (WD-004):** an empty source parses to one empty paragraph, because the schema needs at least one block. `serializeMarkdown` trims trailing whitespace, which drops the empty paragraph the editor keeps after a final heading, list or code block.
- **HTML safety:** without a DOM, HTML stays literal text and serializes escaped (`&lt;script&gt;`). In a browser, `@tiptap/markdown` parses recognized HTML through the schema with `DOMParser`. Script, image and event-handler attributes are discarded, and nothing executes (verified under happy-dom, not yet in a real browser).

## 5. Local data model
Proposed IndexedDB database `writer-local`, with versioned migrations.

```ts
type DocumentRecord = {
  id: string;              // UUID
  title: string;
  markdown: string;        // durable representation
  createdAt: string;       // ISO timestamp
  updatedAt: string;       // ISO timestamp
  schemaVersion: number;
};

type EditorSession = {
  documentId: string;
  revision: number;        // monotonically increases per session edit
  saveState: 'clean' | 'dirty' | 'saving' | 'error';
};
```

`revision` identifies edit state within a live session; it is not a cross-device or persistent concurrent editing mechanism. Autosave must serialize the active revision, execute writes in order, and only mark a revision saved when its specific commit succeeds. Guard asynchronous `get`/`put` against stale document switches. Multiple tabs require either a single-writer coordination mechanism or detectable conflict with a clear user warning; do not silently overwrite a newer record. No browser-storage mechanism guarantees against manual data clearing. Where supported, consider requesting `navigator.storage.persist()` while clearly disclosing that export is the only user-controlled portable backup (https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist).

### WD-006 import/export (2026-10-09)
- **Import** (`src/documents/markdownFile.ts`): from the switcher's "Import .md…", the empty state, or by dropping a file on the page (owner decision: both). Accepts `.md/.markdown/.mdown/.txt` up to 5 MB of strict UTF-8 with no NUL bytes; a BOM is stripped. Import always creates a new document, never overwrites. The title comes from the content, falling back to the file name. The stored Markdown is the normalized form the editor displays.
- **Unsupported syntax (owner decision: warn before import):** a modal lists what will change (tables removed, images become alt text, footnotes become links, task checkboxes removed, HTML becomes text or is dropped, unsafe links removed). Cancel creates nothing.
- **Unsafe links:** `parseMarkdown` now removes link marks whose scheme fails Tiptap's `isAllowedUri` (javascript:, data:, vbscript:...), keeping the text, and reports `unsafeLink`. Before this fix, `[x](javascript:...)` parsed into a live link.
- **Export:** "Export .md" in the switcher, ⇧⌘E / Ctrl+Shift+E anywhere, and a button on the "Couldn't save" and storage-unavailable messages. It exports what is on screen, including unsaved edits, as UTF-8 with a trailing newline. File names come from the title: control/format characters and `<>:"/\|?*` are removed, leading dots and trailing dots/spaces are trimmed, the length is capped at 100, Windows reserved names get a `_` prefix, and the fallback is `Untitled.md`. Export works with the AI service down because it is entirely client-side.

### WD-005 implementation (2026-10-09)
- **Storage:** database `writer-local` v1 with the `documents` store (`DocumentRecord` above) and the `history` store (`{ documentId, entries: HistoryEntry[] }`). History is the accepted-suggestion log, kept beside the document and never part of its Markdown or export (owner decision). Migrations are cased by `oldVersion` in `src/documents/db.ts`.
- **Title:** derived from the first line of the first non-empty block (owner decision). No separate rename; editing the first line renames.
- **Autosave (`src/documents/autosave.ts`):** saves 500 ms after the last edit. Writes are chained, so they land in order. A revision counts as saved only when its own write resolves. A write that throws (quota, blocked) shows an error with Retry and never shows "Saved". Each open document has its own Autosaver, and the editor is remounted per document, so pending saves and undo history can't cross documents. A switch flushes first and refuses to switch if the save fails. Saves also flush on `visibilitychange` (hidden) and `pagehide`.
- **Optimistic concurrency:** `updatedAt` is the version token. A save whose base no longer matches the stored record writes nothing and enters `conflict`. The user then chooses "Load latest" or "Keep mine" (an explicit overwrite), and autosave pauses until they do.
- **Multiple tabs (owner decision):** a BroadcastChannel carries `claim`, `released` and `deleted` messages. Opening a document, or choosing "Edit here instead", claims it. The previous holder flushes, becomes read-only behind a scrim ("“Title” is open in another tab.") and replies `released`. Taking a document back reloads it from storage first. The conflict check above still protects browsers without BroadcastChannel.
- **Unavailable storage:** if IndexedDB can't open, the editor still works with a banner saying nothing will be saved. `navigator.storage.persist()` is requested as a best effort.

## 6. Suggestion state and safe application
**Do not embed unaccepted AI text in persisted Markdown.** Keep it in transient annotation state.

```ts
type TargetSnapshot = {
  documentId: string;
  revision: number;
  from: number;
  to: number;
  original: string;
  hash: string;             // of source text + relevant boundaries
};

type Suggestion = {
  id: string;
  requestId: string;
  source: TargetSnapshot;
  proposed: string;
  kind: 'proofread' | 'expand' | 'rewrite' | 'custom';
  status: 'pending' | 'ready' | 'accepted' | 'rejected' | 'stale' | 'failed';
};
```

Editor transaction mapping/decorations may remap ranges after edits, but **mapping is not sufficient** for safe acceptance. Before applying, verify active document, live mapped range, unchanged source text, and compatible boundaries. If any condition fails, mark stale and ask the user to rerun. Accept is one atomic undoable transaction and schedules a save. Reject removes annotation without mutating document content. For cross-block selections, ensure result can be represented by allowed editor nodes; otherwise reject as unsupported or provide a safe preview path. Avoid injecting provider-returned HTML. ProseMirror supports mapped decorations to maintain annotations across transactions (https://prosemirror.net/docs/guide/).

### WD-003 spike result (2026-10-09): GO
Implementation: `src/editor/suggestions.ts` (a Tiptap extension wrapping a ProseMirror plugin); tests: `src/editor/suggestions.test.ts`.

- **Separate state:** suggestions live only in plugin state. The document, and therefore the serialized Markdown, is identical before Accept. Display uses decorations: `<del>` over the original and an `<ins>` widget for the proposal. These give a strikethrough/underline cue that doesn't depend on color, plus semantics for assistive tech.
- **Lifecycle:** `startSuggestion` freezes the selection as a `pending` target *before* the request is sent. `resolveSuggestion` attaches the response, `acceptSuggestion` applies it and `rejectSuggestion` drops it. A response can only attach to a target that is still `pending`.
- **Stale protection:** every document-changing transaction remaps each target. Edges are exclusive, so typing next to a target doesn't extend it. The live text is then compared with the frozen `original`, and a mismatch marks the target `stale` permanently. Accept re-verifies the range is in one textblock, the text is unchanged and the document ID matches. `setSuggestionDocument` drops everything on a document switch. A newer overlapping request stales older ones. This replaces the proposed `hash` and `revision` fields: comparing the original text directly is stricter than a hash and needs no revision counter.
- **Accept preserves formatting:** the plain-text proposal is diffed word by word against the original (`src/editor/diff.ts`), and only the changed words are replaced. Unchanged words keep their links, bold and inline code. A replaced word takes the marks that spanned it. Inserted text gets only marks shared by both neighbours, so a link or bold run doesn't extend into new words. Hard breaks are kept. It is all one transaction, so a single undo restores the original. The caret is mapped, not moved.
- **History (owner request 2026-10-09):** each Accept records a `HistoryEntry` with the original inline content and its marks (ProseMirror JSON), the original text, the proposal, the document ID and a timestamp. `getSuggestionHistory` reads it. History survives document switches, but it is session-only and unbounded until WD-005 decides persistence. Reject, stale and refused accepts record nothing.
- **Limits:** only selections within a single textblock are accepted. Cross-block targets return `null`, as §6 allows. Formatting inside a *rewritten* word can't be inferred from plain text: the new word takes the marks that spanned the old one. Display still shows whole-range remove/add; WD-009 can render the same `diffText` hunks as token-level highlights.

## 7. Contextual target selection
1. If text selection is nonempty, use the selected range, subject to size limits.
2. Otherwise resolve a sentence around the caret using locale-aware segmentation where available (`Intl.Segmenter` as a candidate), then apply explicit boundary tests for punctuation, abbreviations, quotations, lists, and Markdown blocks.
3. Only automatically check sentences that have an identifiable completion boundary; never assume any typing pause implies a completed sentence.
4. Do not submit empty, whitespace-only, code-only, or ambiguous targets without user direction.
5. Freeze `TargetSnapshot` before beginning an AI request and supply only a bounded minimal context window. Context must be defined and capped once cost limits are approved.

## 8. AI backend contract (proposed)
Endpoint names below are suggested, not existing routes.

### `POST /api/ai/suggest`
Authenticated and authorized; content type JSON.

**Request:**
```json
{
  "requestId": "uuid",
  "action": "proofread",
  "targetText": "The ideas is good.",
  "contextBefore": "",
  "contextAfter": "",
  "instruction": null,
  "locale": "en"
}
```

**Response:**
```json
{
  "requestId": "uuid",
  "status": "suggestion",
  "replacementText": "The idea is good.",
  "reason": "Corrected subject-verb agreement."
}
```

`status` enum `suggestion | no_change`. A request/response schema must enforce bounded string lengths, enums, and response sizes; reason is optional and shown only if safe to display. Client computes diff against snapshotted target. For the MVP, one replacement per request is simpler than model-generated arbitrary edit offsets and is sufficient for highlighting token-level changes in the UI. Never trust model-provided offsets.

**Error classes:** 400 invalid input, 401 unauthenticated, 403 not allowlisted, 413 payload too large, 429 rate/budget exceeded, 502 upstream invalid response, 503 upstream unavailable, 504 timeout. Return stable error codes and a request ID, not provider secrets or raw prompts.

**Provider adapter:** `suggest({action, targetText, contextBefore, contextAfter, instruction, locale, signal}) -> {status, replacementText?, reason?}`. Keep provider-specific messages/model IDs, transport, and parsing in the adapter. Structured provider output is preferred, then validated server-side. Prompts must instruct minimal proofread changes and prohibit injecting fabricated claims into expansions.

**Hosted AI privacy:** request the minimum context; apply the provider's approved retention policy; do not put document content in logs, analytics, URLs, or error traces. Third-party requests must be disclosed in the UI.

### WD-007 implementation (2026-10-09)
**Provider: Claude (Anthropic API), one model per task (owner asked for the best fit per task).** Configurable via `MODEL_PROOFREAD` / `MODEL_COMPOSE`.

| Task | Model | Effort | Why | Est. cost/request* | Requests per $10 |
|---|---|---|---|---|---|
| Proofread (manual and automatic) | `claude-haiku-5-5` ($0.10 / $0.50 per MTok) | low | Small, mechanical, latency-sensitive, high volume (auto-proofreading fires per sentence) | ~$0.0002 | ~50,000 |
| Rewrite, Expand, Custom | `claude-sonnet-5-5` ($2 / $10 per MTok) | medium | Writing quality matters; Sonnet 5.5 is strong at prose at a fifth of Opus 5.5's output price | ~$0.01 | ~1,000 |

*~1,000 input + ~200 (proofread) / ~800 (compose) output tokens including thinking. Opus 5.5 ($4 / $20) would roughly double compose cost for little gain on single passages; switch `MODEL_COMPOSE=claude-opus-5-5` if quality reviews say otherwise. Sonnet requests send `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) so a safety-classifier false positive is retried server-side on another model; Haiku has no server-side fallback, so a refusal returns `ai_declined`.

- **Request:** `@anthropic-ai/sdk` 0.128.0, `client.beta.messages.create` with `output_config.format` (JSON schema: `status`, `replacementText`, `reason`). The document text goes in as a JSON-encoded user message (`passage`, `contextBefore/After`, `instruction` only for Custom), and the system prompt marks it as data, not instructions. Output is validated server-side again (`parseOutput`): enum, types, a 20,000-character cap. Anything else returns 502 `upstream_invalid`. Replacement text is inserted client-side as plain text, so model output is never rendered as HTML.
- **Auth (SEC-001, owner decision: email magic links):** `POST /api/auth/request` always returns 202, so the allowlist can't be probed. It is throttled to 5/hour per email and 200/hour overall. Allowlisted emails get a single-use 15-minute link; only the token's SHA-256 is stored. The link opens a confirm page, and the token is consumed only by its POST, because mail scanners prefetch GET links. The session is a random token (hashed at rest) in an HttpOnly, SameSite=Lax cookie (`__Host-` prefixed and Secure in production) lasting 30 days. The allowlist (`ALLOWLIST`) is re-checked on every request, so removing an email revokes access. All POSTs must carry `Origin` = `APP_ORIGIN`. No email provider is chosen yet: development prints the link to the server console, and production returns 503 `mail_unavailable`.
- **Limits (SEC-002, owner decision):** 100 requests per user per UTC day (counted per attempt), at most 2 in flight per user, and $10 per UTC month across all users. Before each call the worst-case cost (input estimate + `max_tokens` at the model's rate) is reserved atomically in SQLite and then settled to the actual cost from `usage`. A fallback turn is priced at the dearer of the requested and serving models; unknown models get the worst rate. Exhaustion returns 429 `daily_limit` / `too_many_concurrent` / `budget_exhausted`.
- **Bounds and errors:** 64 KB body, target ≤ 4,000 chars, each context ≤ 2,000, instruction ≤ 500 (413 `payload_too_large`); 400 `invalid_input` / `empty_target` / `missing_instruction`; 25 s timeout and client disconnect abort the provider call (504 `upstream_timeout`); provider outage, rate limit or auth failure gives 503 `upstream_unavailable`; refusal gives 422 `ai_declined`. Errors carry `{ error, requestId }`, and `X-Request-Id` is echoed.
- **Logging:** one JSON line per request: request ID, action, outcome, latency, cost. No document text, prompts, outputs or emails (tested).
- **State:** `node:sqlite` file (`DATABASE_PATH`) holding sign-in tokens, sessions, daily counters and monthly spend. It contains no document content. It is a single instance; `node:sqlite` is experimental in Node 24 and prints a warning at startup.

### OpenRouter adapter (2026-10-09, owner request)
`AI_PROVIDER=openrouter` with `OPENROUTER_API_KEY` and explicit `MODEL_PROOFREAD` / `MODEL_COMPOSE` OpenRouter ids (startup fails without them; the Claude defaults don't apply). `server/ai/openrouter.ts` calls the OpenAI-compatible `/api/v1/chat/completions` with `fetch` (no new dependency), sending the same system prompt, JSON-encoded user content and output schema as the Claude adapter, and validating with the same `parseOutput`. `provider.require_parameters` routes only to providers that honor `response_format` JSON schema; `provider.max_price` caps routing at $10 / $50 per million input/output tokens, which is also the rate used for the budget reservation. Settled cost is `usage.cost` from the response, or tokens at the cap when absent. Errors: 403 (moderation) and `content_filter`/refusal → `ai_declined`; other non-2xx, an `error` body or network failure → `upstream_unavailable`; abort or 30 s timeout → `upstream_timeout`; non-`stop` finish or invalid JSON → `upstream_invalid`. No live OpenRouter call has been made (no key).

### WD-008/009 client (2026-10-09)
- `src/editor/target.ts` resolves the target (selection, else caret sentence via `Intl.Segmenter` in the document locale) and up to 2,000 characters of context each side, matching the server limits.
- `src/ai/useAi.ts` owns requests for one editor instance: `startSuggestion` freezes the target, the response goes through `resolveSuggestion`, and unmounting the editor (document switch) aborts all in-flight requests. Request ID = suggestion ID; the client rejects a response whose `requestId` differs.
- The suggestions plugin now renders word-level hunks (`diffText`) instead of one whole-span replacement.
- `/api/auth/me` is called on app load (no document content) and before each action; a 401 from `/ai/suggest` marks the account signed out.

## 9. Background proofreading state machine
States: `disabled → eligible → idle_pending → request_pending → annotation_ready`, with cancel/reset paths to `eligible` or `disabled`.

- Disabled by default and explicitly enabled by user action.
- A completed sentence becomes eligible; start a fresh 3000 ms idle timer after the most recent relevant activity.
- Resume typing, change the document/target, invoke IME composition, or disable feature: cancel timer and abort pending request where possible.
- An aborted network request can still resolve; response checks request ID, active document, target hash/revision and current enabled state before annotation.
- Deduplicate identical `(documentId, sentenceHash, action)` within the session; cap concurrency (recommended one automatic request at a time).
- Silent annotations cannot move focus or caret. Keyboard-accessible reveal on deliberate review action.
- 429/quota exhaustion suspends auto-requests until permitted and shows a nonintrusive status.

Tests use fake clocks for three-second boundaries and delayed/reordered provider stubs.

### WD-010 implementation (2026-10-10)
- **Toggle:** "Check as I write" switch in the documents menu (owner decision), stored in localStorage, off by default. Enabled only after the data notice and while signed in.
- **Scheduler** (`src/ai/autoProofread.ts`): an edit arms a 3000 ms timer; any edit or caret move while armed restarts it. On fire: skip if read-only or mid-IME (`view.composing`); target = last sentence before the caret that ends in terminal punctuation (`completedSentence` in `src/editor/target.ts`), skipping the sentence still being typed; skip sentence texts already checked in this editor session and ranges with a live suggestion. One background request at a time.
- **Display:** pending checks are invisible; a ready one is a dotted underline (owner decision) with no popup, status message, focus or caret change. Clicking it, or ⌘J with the caret inside, opens the normal del/ins review. ⌘Enter / Escape act only on opened or explicit suggestions.
- **Quota:** background checks count toward the same 100 requests/day (assumed; owner answered "automatic checks", read as "same quota"). A `daily_limit`, `budget_exhausted`, `unauthenticated` or `not_allowlisted` reply pauses background checks for that editor and shows one status message. Other errors are silent.
- **Off / document switch:** turning the switch off aborts background requests and removes unopened annotations; unmounting the editor (document switch) aborts everything.
- Tests use real timers (Playwright waits of 2.5 s / 3.5 s), not a fake clock.

## 10. Security and access controls
- Use HTTPS, authenticated sessions and server-side allowlist for the private beta, subject to SEC-001 approval. Frontend route hiding alone is not authorization.
- AI provider key resides in server environment/secrets store, never delivered in JS bundles.
- CSRF protections appropriate to auth design, strict same-site/cookie rules where applicable, CORS restrictions, secure headers, request body limits, timeout and bounded retries.
- Rate-limit per account, cap input/output tokens, enforce per-user/global cost budgets and concurrent requests. Thresholds (SEC-002): 100 requests per user per UTC day, $10 per UTC month overall.
- Import/export filenames and model text must be treated as untrusted; no unsanitized HTML execution, prototype pollution via parsed JSON, or evaluation of generated code.
- Log metadata-only request IDs/error categories; no default document, prompt or provider-response logging.
- Provide clear local-storage and AI-transmission disclosure. Do not claim local processing when hosted AI is used.
- **AI disclosure (OPS-001, owner-confirmed 2026-10-09).** Shown once before the first AI request, and reachable later. Text: "Your documents stay in this browser. When you use AI, the selected text and a little surrounding context are sent to Anthropic's Claude to produce a suggestion. Anthropic keeps API data for up to 30 days and doesn't use it to train models. It may keep it for up to 2 years if its safety systems flag it, or when the law requires." Source: https://platform.claude.com/docs/en/manage-claude/api-and-data-retention. Revisit if the organization enables zero data retention.
- **Sign-in mail (SEC-001):** Resend HTTP API (`resendMailer` in `server/auth.ts`), configured by `RESEND_API_KEY` and `MAIL_FROM`. A send failure is logged without the address and still answers 202, so the allowlist can't be probed.

## 11. Accessibility and desktop experience
Target WCAG 2.2 AA. Keyboard: document list, toolbar, shortcut, menu navigation, selection, suggestion review/accept/reject, export. Maintain logical focus after menu close. Suggestion emphasis must not rely solely on red/green color; assistive technology must receive descriptive text. Respect reduced motion, 200% zoom and screen-reader announcements. Test shortcut collisions, including browser-reserved Ctrl+J.

## 12. Performance and resilience
- Instrument editor responsiveness using a representative 25k-word fixture; no sustained >100 ms blocking during ordinary typing in the agreed test environment (proposed budget).
- Avoid reparsing entire document on every keystroke or sending AI requests per keystroke.
- Debounced autosave (~500 ms proposed), sequential commits and explicit saved/error states.
- Preserve editing and export during API outage. API timeouts are finite and recoverable.
- Initial desktop targets: latest two stable versions of Chrome, Firefox, Edge and Safari, subject to confirmation.
- Stale AI response or storage write must not affect another document after switch.

## 13. Validation matrix
| Check | Scope | Evidence expected |
|---|---|---|
| Type check / lint / production build | frontend and backend | Executed command output with exit status |
| Editor unit tests | text/marks/blocks, undo, target resolution | Passing test report |
| Markdown round-trip | fixture corpus for supported schema | Original vs reimport semantic comparison |
| Persistence integration | IndexedDB writes, quota failure, tab conflict, migrations | Test output + failure screenshots as needed |
| API contract and security | auth, allowlist, input limits, 429, malformed model response | Integration report |
| AI target safety | modify source while waiting, remap selection, switch docs | Deterministic E2E results |
| Auto proofreading | opt-in, punctuation, 3000 ms idle, IME, cancellation, deduplication | Fake-clock tests and E2E evidence |
| Accessibility | keyboard, semantic diff, focus, screen reader spot-check | Automated audit and manual checklist |
| Browser smoke | Chrome, Firefox, Safari, Edge | Recorded results, especially shortcut mappings |
| Resilience | API down, slow responses, local storage unavailable | Recovery test evidence |

Validation commands must be filled from the actual repository. Do not invent command names or claim tests have run.

## 14. Early technical spikes and gates
Before implementing AI suggestions or adopting the editor as final:
1. Initialize empty repository; identify framework, package/toolchain and testing choices (TECH-001).
2. Prototype basic rich text -> Markdown -> rich text round-trip against sample fixtures; record data loss and unsupported markup.
3. Prototype mapped, nonpersistent decorations + atomic accept and stale-source rejection after edits.
4. Verify keyboard shortcut behavior across target desktop browsers and accessible menu fallback (UX-001).
5. Choose actual identity provider/hosting; demonstrate backend allowlist enforcement and protected secrets (SEC-001).
6. Define model cost budget, quotas and error codes before exposing AI functionality to beta users (SEC-002).

## 15. Decisions to approve
| ID | Decision | Proposed resolution | Gate |
|---|---|---|---|
| SEC-001 | Private access | Managed sign-in with invited identity allowlist | Before hosted beta |
| SEC-002 | Spend/quota | Configurable per-user and global caps | Before AI beta |
| UX-001 | Shortcut collision | Test `Meta+J`; choose nonreserved fallback on other browsers | Before keyboard acceptance |
| DOC-001 | Portability | Confirm Markdown import/export P0 | Before PRD freeze |
| TECH-001 | Repository/host | Inspect existing repo or approve greenfield | Before task plan |
| OPS-001 | Privacy and retention | Select compliant provider/settings, publish clear disclosure | Before beta |

## 16. References
- Tiptap Markdown docs: https://tiptap.dev/docs/editor/markdown
- ProseMirror editing/decorations guide: https://prosemirror.net/docs/guide/
- MDN Storage persistence: https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist
- MDN quotas/eviction: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
