# AI Markdown Editor: Product Requirements Document

- **Version:** 1.0 (specification draft)
- **Date:** 2026-10-09
- **Status:** Product baseline confirmed; technical assumptions remain provisional
- **Audience:** Product owner, engineering, AI coding harness, QA
- **Related:** [TECH_SPEC.md](TECH_SPEC.md), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), [AGENTS.md](AGENTS.md), [PROGRESS.md](PROGRESS.md)

## 1. Product overview

### 1.1 Problem
Existing writing tools can make AI too intrusive, too eager to rewrite, or difficult to invoke without losing focus. Users need a dependable visual writing environment that saves portable Markdown while offering restrained AI assistance at exactly the right moment.

### 1.2 Vision
A distraction-free, desktop-first visual Markdown editor with on-demand AI assistance and optional silent proofreading. Writing remains under the user's control: AI proposes changes and never directly replaces document text without acceptance.

### 1.3 Target users and use cases
General-purpose writers: people drafting notes, articles, personal writing, and everyday documents. Initially available to a private beta group.

Primary journeys:
1. Create a document, write and format content, switch documents, and return to previously saved work.
2. Select text (or position the cursor in a sentence), open AI commands using a keyboard shortcut or accessible UI affordance, and choose Proofread, Expand, Rewrite, or Custom.
3. Review proposed edits as inline diffs, accept or reject, then continue writing without cursor disruption.
4. Explicitly enable automatic proofreading; after a completed sentence and three seconds of idle time, receive a silent indication of a possible correction and review it only when desired.
5. Import and export a Markdown file; continue using the editor during AI failures.

### 1.4 Success criteria and validation targets
The following are **proposed release targets**, not measured results or user-confirmed goals:
- All critical functional acceptance tests pass on the supported desktop browser matrix.
- No high-severity data-loss defect in autosave, document reopen, or import/export testing.
- 100% of tested AI suggestions require an explicit accept action before changing document text.
- No stale AI response can overwrite or target modified source text in regression tests.
- Writing, local save, and export remain usable with the AI service unreachable.
- Keyboard-only completion of create, edit, invoke AI, accept/reject, save, and export journeys.
- 0 critical or serious automated accessibility findings in tested MVP flows, plus manual keyboard/focus review.

### 1.5 Scope
**MVP:** visual Markdown editing; multiple locally saved documents; document creation, title editing, selection, deletion, and autosave; import/export `.md`; standard formatting; command menu; contextual AI actions; non-destructive inline suggestions; opt-in sentence-level proofreading; private-beta access; basic limits and error recovery.

**Out of scope:** cloud document sync; realtime collaboration; publishing; public signups; document folders/tags/full-text search; rich media; tables and advanced Markdown extensions; AI conversation history; custom writing personas; continuous whole-document processing; version history across devices.

## 2. Requirements conventions
- **Priority P0:** required for release. **P1:** desirable but may follow after critical MVP validation.
- **Status:** Confirmed = explicitly selected by product owner; Proposed = default awaiting approval; Unresolved = requires decision.
- Stable IDs **FR-001...** for features, **BR-001...** for business rules, **NFR-001...** for nonfunctional requirements.
- Common errors: show comprehensible user-facing feedback without losing editor content; preserve keyboard focus; never treat an unverified AI response as an accepted edit.

## 3. Functional requirements

### FR-001: Visual Markdown editing [P0, Confirmed]
**Story:** As a writer, I can compose in a visual rich-text editor without viewing raw Markdown syntax.
**Behavior:** support paragraphs, headings, bold, italic, ordered/unordered lists, links, blockquotes, inline code and code blocks, undo/redo. Input: typing and supported formatting commands. Output: rendered editable document with Markdown-compatible structure.
**Validation:** empty editor accepts typing; supported formatting survives document save/reopen and Markdown export/import; undo/redo restores content and formatting. **Edge states:** empty document, pasted plain text, deeply nested blocks, selection spanning formatting. Unsupported pasted formats should be normalized, not silently retained as nonportable rich styling.
**Dependency:** FR-002.

### FR-002: Markdown representation [P0, Confirmed]
**Story:** As a writer, my document remains portable Markdown even though I edit visually.
**Behavior:** treat Markdown as the durable interchange/persistence representation, with an internal rich text model permitted for editing. Do not promise byte-for-byte source preservation. **Acceptance:** supported formatting parses to and serializes from semantically equivalent Markdown; literal code content and link destinations survive; unsupported syntax follows an explicit safe-handling policy rather than disappearing without notice. **Edge:** import unexpected extensions or malformed Markdown. **Dependency:** editor/parser validation spike.

### FR-003: Multiple documents [P0, Confirmed]
**Story:** As a writer, I can work on more than one independent document.
**Behavior:** create, list, open, rename, delete with confirmation; show active document and most recently edited ordering (proposed). **Acceptance:** two documents retain independent content and titles after refresh; deleting one never deletes another; empty collection offers a clear create action; title conflicts are allowed via unique IDs. **Dependencies:** FR-004.

### FR-004: Local autosave [P0, Confirmed]
**Story:** As a writer, I can resume locally stored work after refreshing or reopening the site on the same browser profile.
**Behavior:** persist document content and metadata in browser storage without sending them to the application backend. Expose saving/saved/error state. **Proposed timing:** debounce 500 ms after edits and flush on document switch/visibility change where feasible; do not claim success until write resolves. **Acceptance:** normal refresh and document switch preserve latest committed content; simulated storage failure shows error and offers recovery/export; a failing save does not falsely display `Saved`. **Edge:** quota exhaustion, private browsing restrictions, browser-data clearing, simultaneous tabs. **Dependencies:** FR-003.

### FR-005: Markdown import/export [P0, Proposed for explicit confirmation]
**Story:** As a writer, I can bring in and take out standard Markdown files.
**Behavior:** import `.md` from local device into a new document; export current document as `.md`. **Proposed rule:** invalid/unsupported formatting is reported or safely downgraded; no HTML/script execution from imported text. **Acceptance:** standard fixtures round-trip semantically; exported file contains Markdown; filename is sanitized; importing does not overwrite an existing document without explicit approval. **Dependencies:** FR-001, FR-002, FR-004.

### FR-006: AI command menu [P0, Confirmed]
**Story:** As a keyboard-oriented writer, I can invoke AI without navigating away from text.
**Behavior:** preferred shortcuts are `Meta+J` on macOS and `Ctrl+J` on Windows/Linux, with a visible menu affordance and tested fallback where the browser intercepts the combination. Menu provides four commands and Esc dismissal. **Acceptance:** selection/caret retained when opening menu; keyboard navigation and Escape work; no AI call before action selection. **Edge:** shortcut reserved by browser, IME composition, read-only state. **Dependencies:** FR-007, FR-008.

### FR-007: AI target resolution [P0, Confirmed]
**Story:** As a writer, I want AI to operate on the text I mean.
**Behavior:** if nonempty text is selected, target selection; otherwise target sentence containing the caret. **Proposed rule:** if no complete nonblank sentence is determinable, disable action and explain why instead of guessing at a paragraph. Resolve the target before request and preserve a source revision/fingerprint. **Acceptance:** selected text takes precedence; same sentence/caret targeting is predictable; empty and ambiguous states are handled; heading-only caret produces an explicit target fallback or ineligibility message. **Dependencies:** FR-001.

### FR-008: Four AI actions [P0, Confirmed]
**Story:** As a writer, I can proofread, expand, rewrite, or describe a custom edit.
**Inputs:** target text, action, optional custom instruction, bounded surrounding context, request identity. **Output:** validated suggestion(s) scoped to the target, or explicit no-change/error outcome. **Rules:** Proofread fixes only objectively necessary grammar/spelling/punctuation; Expand may add detail without fabricating facts; Rewrite improves clarity while preserving intended meaning; Custom must respect user instruction unless unsafe or unsupported. **Acceptance:** each command can produce a proposal; no-change is handled; an empty custom instruction cannot submit; provider errors do not alter document. **Dependencies:** FR-007 and backend.

### FR-009: Non-destructive inline diff suggestions [P0, Confirmed]
**Story:** As a writer, I can inspect what AI wants to change before deciding.
**Behavior:** visually distinguish deleted/added segments; support Accept and Reject individually for a suggestion, with an accessible textual alternative to color-only distinctions. Preserve original content until Accept. **Acceptance:** Reject leaves document byte-equivalent at the affected span; Accept applies only intended replacement, forms one undoable editor transaction, and updates local save; Escape closes nonmodal review without accepting. **Edge:** overlapping suggestions and no-change proposals. **Dependencies:** FR-008.

### FR-010: Opt-in silent auto-proofreading [P0, Confirmed]
**Story:** As a writer, I can enable unobtrusive proofreading while I write.
**Behavior:** off by default; with opt-in enabled, after a completed sentence and 3000 ms without user activity, request proofreading of that sentence. Present a subtle nonblocking annotation only if actionable; show details on deliberate interaction. **Proposed semantics:** sentence completion is detected from terminal punctuation plus suitable boundary; no check mid-IME composition; editing resumes cancels queued work; the same unchanged sentence is not checked again in the same session; disable cancels pending work and clears unaccepted automatic annotations. **Acceptance:** no requests when off, before three seconds, on incomplete sentence, or during composition; no popup/focus/caret shift on response; stale responses discarded; rate/cost limits honored. **Dependencies:** FR-007 through FR-009.

### FR-011: Private beta access [P0, Confirmed goal; mechanism unresolved]
**Story:** As an authorized beta user, I can use the hosted editor and AI without exposing provider credentials.
**Behavior:** disallow unauthorized API usage and private-beta application access. **Proposed implementation:** managed login and allowlisted identities with server-side enforcement; users' documents stay on their device. **Acceptance:** unauthorized requests are rejected; credentials absent from shipped frontend bundle; sessions expire and logout works if authentication selected. **Dependencies:** technical decision SEC-001.

### FR-012: AI failure and usage feedback [P0, Proposed]
**Story:** As a writer, I understand when suggestions are unavailable without risking my draft.
**Behavior:** provide inline nonblocking states: queued/loading, no correction needed, failed, rate-limited, unavailable, and canceled; bounded retry by explicit user action. **Acceptance:** failed/invalid responses never mutate text; AI outage leaves editor and export usable; request timeout reports failure and provides retry; rate-limit notice avoids repeated requests. **Dependencies:** FR-008 through FR-011.

## 4. Global behavioral rules
- **BR-001:** No AI operation may alter document text without explicit Accept.
- **BR-002:** Any result referring to changed source text must be discarded or safely revalidated before application. Never apply by stale absolute offsets alone.
- **BR-003:** Automatic proofreading never changes focus, selection, caret position, or opens interruptive UI.
- **BR-004:** Proofreading edits must be minimal; preserve voice, meaning, document structure, URLs, and code.
- **BR-005:** Basic writing, autosave, local document management, and export work without AI connectivity.
- **BR-006:** Supported Markdown must round-trip to semantic equivalence, not necessarily identical source formatting.
- **BR-007:** AI requests send only target text plus bounded minimum needed context; users are informed text leaves their device.
- **BR-008 (proposed):** Each target range may have at most one active unaccepted suggestion; explicit new action supersedes conflicting stale suggestions.
- **BR-009 (proposed):** Closing or switching documents cancels/invalidates in-flight request presentation; responses must not appear on a different document.

## 5. Non-functional requirements
| ID | Requirement | Proposed measurable acceptance |
|---|---|---|
| NFR-001 | Responsive desktop usability | Supported desktop viewport widths 1024-1920 px, 200% browser zoom without lost primary controls. |
| NFR-002 | Accessibility | WCAG 2.2 AA target for MVP UI; complete keyboard flows; semantic announcements; non-color-only suggestions; automated plus manual check. |
| NFR-003 | Local-write resilience | Failed writes are surfaced; normal reload restores last acknowledged save; no false success indicator. |
| NFR-004 | Performance | For 25,000-word fixture, basic typing and cursor navigation remain usable with no sustained >100 ms input blocking in instrumented target browser. Performance budget to be calibrated on target device. |
| NFR-005 | AI request safety | 100% of API requests authenticated and input-limited; credentials server-side; bounded output; no HTML execution. |
| NFR-006 | Observability | Record anonymized request IDs, latency, provider error categories, and token/cost aggregates; do not log document content by default. |
| NFR-007 | Reliability | AI outage does not block editor operations; safe recovery from aborted requests and storage failure. |
| NFR-008 | Browser compatibility | Proposed latest two stable versions of Chrome, Firefox, Safari, and Edge desktop; verify shortcut behavior independently. |
| NFR-009 | Privacy transparency | State locally stored documents and hosted AI transmission clearly before first use. |

## 6. Traceability and release gates
| Journey | Critical requirements | Evidence required |
|---|---|---|
| Write and resume | FR-001, FR-002, FR-003, FR-004 | Editor unit tests; reload E2E; failure injection |
| Import/export | FR-002, FR-005 | Markdown fixture round-trip tests; unsafe input tests |
| Invoke and review AI | FR-006, FR-007, FR-008, FR-009 | Keyboard E2E; API contract tests; diff accept/reject tests |
| Automatic proofreading | FR-007, FR-009, FR-010 | Fake-clock tests; composition/cancellation E2E; no focus shift |
| Secure private beta | FR-011, FR-012 | Authz and rate-limit integration tests; secrets/build checks |
| Reliability | BR-001 through BR-009, NFR-003, NFR-007 | Stale-response regression; offline tests; failed-write tests |

Evidence must reflect **executed** checks and their results. A document alone is not proof that the application passes.

## 7. Outstanding product decisions
1. **SEC-001 (release blocker):** invite allowlist and managed authentication vs alternate controlled beta access.
2. **SEC-002 (release blocker):** allowed per-user usage and spend ceiling, request size, and whether users see quota remaining.
3. **UX-001 (release blocker for final shortcuts):** browser-tested fallback for `Ctrl+J` or alternative approved mapping.
4. **DOC-001:** confirm Markdown import/export as explicit MVP commitment and storage-loss disclosure.
5. **UX-002:** confirm precise sentence-boundary heuristics, including Spanish abbreviations and multiline punctuation; proposed approach should be tested rather than assumed reliable.
6. **TECH-001:** repository confirmed empty at `Omar12/writedown` on 2026-10-09; hosting environment and dependency constraints remain unresolved.
7. **OPS-001:** required privacy policy/terms and retention guarantees of chosen AI provider.

## 8. Change control
On changed requirements, record the new decision, revision date, affected FR/BR/NFR IDs, impacts to TECH_SPEC.md, acceptance tests, and implementation tasks. Do not renumber existing IDs. Product owner approval is required for any expansion of the scope boundary.
