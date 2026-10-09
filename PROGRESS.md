# PROGRESS.md: Writedown Delivery Tracker

- Snapshot date: 2026-10-09
- Repo: `https://github.com/Omar12/writedown`
- Repository observation: `main` exists as GitHub default branch label, but repository is empty (size 0); contents returned GitHub 404 "repository is empty" and commit listing returned 409 "Git Repository is empty".
- **No implementation tasks have started; no tests or builds have been run.**
- Planning documents exist in the current conversation workspace, **not in GitHub** unless separately committed.

## Milestone status
| Milestone | Tasks | Status | Evidence |
|---|---|---|---|
| M0 Foundation and spikes | WD-001 to WD-003 | Not started | GitHub empty repo inspection only |
| M1 Offline editor | WD-004 to WD-006 | Not started | None |
| M2 Explicit AI | WD-007 to WD-009 | Not started | None |
| M3 Auto proofreading and beta | WD-010 to WD-012 | Not started | None |

## Task status
| Task | Title | Status | Validation evidence |
|---|---|---|---|
| WD-001 | Repository/toolchain/CI initialization | Not started | Not executed |
| WD-002 | Markdown fidelity spike | Not started | Not executed |
| WD-003 | Inline suggestion safety spike | Not started | Not executed |
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

## Open decisions
| ID | Decision | Proposed answer | Gate | Status |
|---|---|---|---|---|
| DOC-001 | Markdown import/export P0 | Include | WD-006 | Owner confirmation pending |
| SEC-001 | Private-beta auth | Managed sign-in plus server-side allowlist | WD-007 / WD-012 | Open |
| SEC-002 | Hosted AI budgets | Per-user and global configurable limits | WD-007 / WD-012 | Open |
| UX-001 | Shortcut mapping | Browser test Meta+J; fallback for Ctrl+J | WD-008 | Open |
| OPS-001 | Privacy/retention | Confirm provider settings and disclosure | WD-007 / WD-012 | Open |
| TECH-002 | Hosting and runtime | Decide during WD-001 | WD-001 / WD-012 | Open |

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
