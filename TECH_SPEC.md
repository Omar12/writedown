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

## 10. Security and access controls
- Use HTTPS, authenticated sessions and server-side allowlist for the private beta, subject to SEC-001 approval. Frontend route hiding alone is not authorization.
- AI provider key resides in server environment/secrets store, never delivered in JS bundles.
- CSRF protections appropriate to auth design, strict same-site/cookie rules where applicable, CORS restrictions, secure headers, request body limits, timeout and bounded retries.
- Rate-limit per account, cap input/output tokens, enforce per-user/global cost budgets and concurrent requests. Exact numerical thresholds blocked on SEC-002.
- Import/export filenames and model text must be treated as untrusted; no unsanitized HTML execution, prototype pollution via parsed JSON, or evaluation of generated code.
- Log metadata-only request IDs/error categories; no default document, prompt or provider-response logging.
- Provide clear local-storage and AI-transmission disclosure. Do not claim local processing when hosted AI is used.

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
