# Paperclip UI extraction: decisions and approvals

Status: rendered-page and source/API extraction complete; Company OS adaptation pending.

## Evidence pin

- Upstream checkout: `213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`
- Upstream tag: `v2026.817.0`
- License: MIT (reference only; no page code is copied)

Existing valid captures were reused rather than regenerated:

- `docs/audits/2026-08-20-paperclip-page-atlas/reference/desktop-decisions.png`
- `docs/audits/2026-08-20-paperclip-page-atlas/reference/mobile-decisions.png`

## Route and source map

| Page | Route | Primary source | Supporting source / API |
|---|---|---|---|
| Attention/decision desk | `/decisions` | `ui/src/pages/WhatNeedsMe.tsx` | attention API, dismissal/snooze helpers, decision shelves/cards/toolbars |
| Decision queue | `/decisions/queues/:key` | `ui/src/pages/DecisionQueuePage.tsx` | queue API and queue rail |
| Approval list/detail | `/approvals/pending`, `/approvals/all`, `/approvals/:id` | `ui/src/pages/Approvals.tsx`, `ApprovalDetail.tsx` | `ui/src/api/approvals.ts`, approval payload/card |
| Standalone decision resolution | embedded in the desk | `ui/src/components/DecisionResolver.tsx`, `DecisionCard.tsx` | `ui/src/api/decisions.ts` |

## Page functionality

- One attention desk combines approvals, plan confirmations, questions, recovery actions and other human-needed work.
- Filter by type, queue and date; group by arrival, type, project or severity.
- Collapsible shelves distinguish immediate work from aging work.
- Dismiss, snooze and restore have explicit state and an undo window.
- Keyboard queue navigation and decision actions are guarded when dialogs are open.
- Decision cards show origin, target snapshots, option effects and target drift.
- Options may require structured inputs and can execute multiple effects.
- Decision effects track claimed, executed, failed or skipped outcomes independently.
- Approvals support approve, reject, request revision, resubmit, comments and linked tasks.
- Empty, filtered-empty, stale, expired, cancelled, dismissed, partial and failed-execution states are represented.

## Strong patterns

- Separate a proposed decision from the execution of its chosen effects.
- Snapshot decision targets and warn when they changed before resolution.
- Require idempotency for deciding.
- Keep terminal history and per-effect outcomes.
- Make deferral reversible through snooze/restore instead of silently hiding work.
- Use one human attention surface while retaining typed underlying sources.

## Company OS product conflicts

- A generic board/user approval is weaker than Company OS's accountable-human contract.
- Company OS must bind the exact action, digest, work, responsibility contract, executing Agent, approving human, evidence and eventual result.
- The approving human must be authorized for the risk/data scope, not merely able to open the page.
- Decision notes and task chat are context, not the evidence record itself.
- Resuming execution after approval must use the same fenced attempt and idempotency boundary.

## Accepted Company OS mapping

- Agent Boss “需要我” desk groups high-risk approval, blocked work, missing evidence and runtime uncertainty.
- Each approval card shows goal, requester, accountable human, Agent, exact action, risk, data scope, evidence summary, expiry and immutable digest.
- Approve/reject records a structured decision against the expected binding; stale bindings fail closed.
- Approval and resumed execution outcomes appear in the responsibility record and audit/evidence timeline.
- Snooze may affect personal attention presentation only; it never changes approval expiry or execution safety state.

## What is not copied

- Paperclip decision/approval components, visual styling, wording, shared types and API client.
- Generic Agent-as-origin authority assumptions.
- Any effect executor or database identifier coupled to Paperclip internals.
