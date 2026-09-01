# Company OS Generator-informed migration inventory

Date: 2026-08-31  
Status: implemented and browser-verified  
Companion proposal: `2026-08-31-generator-source-audit-and-direction.md`

## Purpose

This inventory maps every in-scope Company OS page and secondary flow to its implementation, final visual composition, reusable primitives and acceptance evidence. It was executed as shared foundation work followed by vertical slices and full-page migration.

Generator references are visual sources only. They do not introduce Generator, RAFT, Paperclip, vendor, media-generation or runtime concepts into Company OS product layers.

## Shared implementation batches

| Batch | Current source | Migration target | Required tests/evidence |
| --- | --- | --- | --- |
| Typography and color | `web/family-ui.css` root tokens; local literals in `web/styles.css` | Adopt the proposed 40/24/20/18/15/14/13/12/11 scale; use only 400/500/600; add warm canvas/raised surface roles while retaining semantic status colors. | Computed rail/main/modal/drawer font family, size, weight and line-height in zh-CN and en. |
| Shell and workspace | `.company-os`, `.company-rail`, `.app-main`, `.topbar`, `.workspace` | Quiet the labelled rail, widen the working lane, retain 24px desktop and 20px tablet gutters, and prevent shallow content strips followed by empty canvas. | 1440x900 and 1024x768 shell geometry; no horizontal overflow; destinations remain reachable. |
| Page header | `raftPageHeader`, duplicate `pageHeader`, `.control-page-title`, `.family-page-header` | One shared app-page header with 24px title, optional quiet kicker/status and consistent action alignment. Remove duplicate hierarchy implementations without changing copy or routes. | All in-scope pages have one h1 and matching computed hierarchy in both locales. |
| Focal workspace | Dashboard/approval/usage page-specific panels | Add a reusable composition contract: one dominant work surface plus optional supporting column/strip. This is a CSS/composition primitive, not a new product abstraction. | First viewport contains the page subject at both target widths; screenshot comparison. |
| Lists and records | `.product-list-surface`, `.product-record-row`, portfolio Agent/Work variants | Object-first row contract with monogram/icon, identity/title, current state and supporting metadata. Technical fields remain complete but visually secondary. | Long English and technical enum wrapping; keyboard opening; no information loss. |
| Buttons/statuses | `.family-button*`, `.family-status*`, `.status-pill`, `.portfolio-badge` | Consolidate action hierarchy and status shape; use a 6px square action radius, 4px textual badge radius and 8px form controls. Preserve danger/approval semantics and reserve circles for literal dot indicators. | Static contract tests plus focus-visible and disabled/busy states. |
| Modal | `.family-modal`, `.editor-dialog`, command/restore dialogs | 600–640px creation/edit modal, 420–460px dangerous confirmation, 560–600px renewal; center in the browser viewport without depending on shell geometry. | Initial focus, Tab containment, Escape, backdrop rules, submitting protection, trigger focus return, continuous resize and geometry. |
| Drawer | `.family-drawer`, colleague/evidence dialogs | 520–600px contextual inspection with stronger object header and grouped secondary metadata; naturally reaches full width when the viewport is at or below the drawer maximum. | Right-edge geometry, internal scrolling, Escape, backdrop, focus return and 1024 behavior. |
| Popover | company switcher and small anchored actions | Generator-like bounded white surface, compact padding, soft border/shadow; no generic fixed-position floating panel for short choices. | Anchor geometry, outside click, Escape and focus return. |
| Empty/loading/error | `.product-empty-state`, page-specific messages | Shared state hierarchy with a clear cause and permitted next action. No 11px critical message. Demo copy stays explicit. | Screenshot and accessibility-name assertions for representative states. |

## Page migration matrix

### Public front door

- Current implementation: `web/mount.ts` front-door rendering; `.company-front-door`, `.front-door-*` in `web/styles.css`.
- Current problem: the display scale exists, but page atmosphere and product entry do not establish the same disciplined focal composition as Generator.
- Target: retain Company OS proposition and Demo/formal boundary; use a single 40px display statement, restrained warm surface and two compact entry actions. No Generator media copy or generation metaphor.
- Secondary flows: Demo entry and formal sign-in remain page navigation.
- Evidence: zh/en at 1440 and 1024; Demo boundary visible without scrolling; keyboard order and focus-visible.

### Demo Dashboard / Agent Portfolio

- Current implementation: default branch of `agentPortfolioPage` in `web/pages/agent-portfolio-pages.ts`; `.portfolio-dashboard-console` and its KPI, authority, signal and work-table regions.
- Closed problem: the former large attention card and “three-minute path” read like generic AI onboarding rather than an operating console.
- Implemented composition:
  1. 24px page title and concise boundary badge.
  2. Compact revision/provenance toolbar with direct Agent and approval actions.
  3. Five snapshot-derived KPI cells for inventory, governed coverage, open signals, cost and evidence.
  4. Actual management-depth distribution and an actionable operational-signal queue.
  5. Dense source-aware recent-work table with evidence, cost and status.
- Preserved semantics: all fixture counts, costs, Demo labelling and no-external-call claims.
- Evidence: first viewport occupancy, target hierarchy, deterministic content equality and no overflow.

### Agents

- Current implementation: public `agentPortfolioPage("agents")`; formal/local `agentsPage` in `web/pages/operational-pages.ts`; Agent drawer in `web/mount.ts`.
- Current problem: public rows lead with management depth and four technical fields; local rows combine lifecycle, execution qualification, policy, responsibility and actions in one dense record.
- Target composition:
  1. Identity cluster: monogram, Agent name, role and accountable human.
  2. Immediate state: health/lifecycle/current work.
  3. Compact management-depth status.
  4. Runtime, visibility, privacy and responsibility fields in a secondary two-column region or the detail drawer.
- Interaction: row opens right drawer; Add Agent remains a modal; lifecycle and responsibility actions keep their existing server commands and confirmation requirements.
- Evidence: row and drawer at 1440/1024, zh/en; long enum wrapping; trigger focus return; Add Agent geometry and keyboard path.

### Work and task detail

- Current implementation: public `agentPortfolioPage("work")`; local list/detail renderers in `web/mount.ts`; inbox/work records in `web/pages/operational-pages.ts`.
- Current problem: public Work is a flat list while local work detail uses a different composition vocabulary.
- Target composition:
  1. Work list remains scan-oriented.
  2. Selected/current work becomes the focal subject with status progression, accountable human, Agent and evidence summary.
  3. Source-return actions remain visible for Observed/Federated records.
- Interaction: complex/shareable task stays a page route/state; New Task remains a modal; source links remain external-return actions.
- Evidence: list → detail → back; source action visibility; new-task focus behavior; no source/authority claim changes.

### Approvals and rejection

- Current implementation: public `agentPortfolioPage("approvals")`; formal/local `approvalsPage` in `web/pages/operational-pages.ts`; decision actions are bound in `web/mount.ts`.
- Current problem: one sparse approval card sits at the top of an otherwise empty page; evidence, impact and decision context do not form a coherent review workspace.
- Target composition:
  1. Dedicated page-level review workspace.
  2. 20px immutable action title and explicit accountable parties.
  3. Evidence and policy summary in the dominant surface.
  4. Stable decision footer with secondary evidence, primary approval and danger rejection.
  5. Decision history below or in a supporting column.
- Interaction: approval/rejection remains page-level; evidence opens a drawer; dangerous confirmation remains explicit where currently required. No optimistic success before the authoritative response.
- Evidence: pending, approved, rejected, loading and error states; exact action/owner/evidence values unchanged; keyboard operation and focus restoration.

### Evidence

- Current implementation: `evidencePage` in `web/pages/operational-pages.ts`; public approval evidence drawer in `agent-portfolio-pages.ts`; `.evidence-detail-dialog`.
- Current problem: identifiers and digest metadata visually dominate the human-readable evidence meaning.
- Target: list leads with evidence kind and summary; provenance, digest, source and recorded time remain complete in the drawer. Read-only and Demo boundaries stay prominent.
- Interaction: list → right drawer; no generic file-browser behavior.
- Evidence: drawer geometry and focus; long digest wrapping; read-only semantics and exact IDs unchanged.

### Governance / Connectors

- Current implementation: public `agentPortfolioPage("connectors")`; local `renderAdministration` in `web/mount.ts`.
- Current problem: three equal explanation cards do not show the relationships among identity, data, credentials, Connector health and management depth.
- Target: responsibility/boundary relationship is the focal subject; capability truth, personal privacy and external synchronization become supporting explanations. Existing Connector/forms remain operational surfaces below.
- Interaction: existing create/configure/review flows retain their current authority and validation; only surface hierarchy changes.
- Evidence: public Demo and local/formal states at both widths; all safety badges and controls visible; no vendor concept enters inward layers.

### Usage & Billing / Usage & Budgets

- Current implementation: public `agentPortfolioPage("usage")`; formal/local `usagePage` in `web/pages/operational-pages.ts`; renewal events in `web/mount.ts`.
- Current problem: subscriptions, credentials and renewal cards have equal weight; formal usage is a form followed by undifferentiated record lists.
- Target composition:
  1. Usage trajectory/budget exposure as the focal subject.
  2. Verified spend, unpriced events and active policies as compact supporting metrics.
  3. Credential alerts and renewal state in a clear secondary region.
  4. Cost events remain a dense audit list.
- Interaction: budget editing retains its form; credential renewal uses one bounded workflow modal with validation and authoritative result state.
- Evidence: public renewal request and formal budget form; values unchanged; keyboard/focus/error handling; no invented billing data.

### Organization and people details

- Current implementation: `renderOrganization` and human/Agent drawers plus add/edit dialogs in `web/mount.ts`.
- Current problem: this surface already has the correct drawer/modal classification, but headers and field groups do not match the proposed Generator-informed visual hierarchy.
- Target: keep information architecture; migrate object headers, grouped metadata, form spacing and action footer to the same Agent/detail contract.
- Evidence: add department, add human, add Agent, human detail, Agent detail and edit paths at 1440/1024 in zh/en.

### Activity, Responsibility, Settings and search

- Current implementation: `activityPage`, `renderAccountability`, `renderSettings`, command palette in `web/mount.ts`.
- Target: migrate shared page header, typography, lists and overlay surfaces after the primary page families are stable. Do not redesign their product structure during the visual pass.
- Evidence: representative screenshots, keyboard navigation and no regression of structured event codes or safety copy.

## Secondary-flow inventory

| Entry | Current trigger/surface | Final surface | Implementation owner |
| --- | --- | --- | --- |
| Agent row → Agent detail | row/button → native dialog drawer | Right drawer | `web/mount.ts`, `.colleague-detail-dialog` |
| Human row → human detail | row/button → native dialog drawer | Right drawer | `web/mount.ts`, `.colleague-detail-dialog` |
| Evidence row → evidence detail | button → native dialog drawer | Right drawer | `operational-pages.ts`, `.evidence-detail-dialog` |
| Add Agent | button → native dialog modal | 600–640px centered modal | `web/mount.ts`, `.editor-dialog` |
| Add human/department | button → native dialog modal | Centered modal | `web/mount.ts`, `.editor-dialog` |
| New task | button → native dialog modal | Centered modal | `web/mount.ts`, `.task-dialog` |
| Approval/rejection | page actions | Page review + stable footer | `operational-pages.ts`, `web/mount.ts` |
| Review approval evidence | page action → drawer | Right drawer | public/local approval renderers |
| Credential renewal | Usage action → dialog | 560–600px workflow modal | `agent-portfolio-pages.ts`, `web/mount.ts` |
| Company restore/danger | action → dialog | 420–460px danger modal | `web/mount.ts`, `.company-restore-dialog` |
| Search | quick action → command dialog | Keyboard-first modal | `web/mount.ts`, `.command-palette` |
| Company switcher | brand → anchored menu | Popover | `web/mount.ts` |

## Completed implementation order

1. Replaced the token and shared primitive styling without changing domain behavior.
2. Migrated the shell, page header, locale-aware typography and content-lane overlay geometry.
3. Implemented Dashboard as a professional control-plane snapshot with compact KPIs, authority distribution, operational signals and recent-work audit rows.
4. Implemented the object-first Agents list, Agent drawer and centered Add Agent modal.
5. Implemented Approval Review, evidence drawer, stable decision footer and safe-focus rejection confirmation.
6. Completed the 1440/1024, zh/en visual checkpoint before continuing.
7. Migrated Work, Governance and Usage, including the bounded credential-renewal workflow.
8. Re-verified the front door and shared local/formal creation/detail surfaces.
9. Captured final evidence and ran repository verification.

## Acceptance matrix

Every in-scope page must have:

- 1440x900 Chinese screenshot.
- 1440x900 English screenshot.
- 1024x768 Chinese screenshot.
- 1024x768 English screenshot.
- zero horizontal overflow.
- one inherited locale-aware font contract across rail and work lane.
- visible focus for every interactive control reached in the representative path.

Every representative secondary flow must additionally prove:

- correct surface type and geometry.
- initial focus.
- Tab/Shift+Tab containment where modal.
- Escape behavior.
- backdrop behavior.
- internal scroll containment.
- loading, error and empty-state hierarchy where applicable.
- focus return to the exact trigger.

Final repository gates remain:

1. `npm run typecheck`
2. `npm run build`
3. `npm test`
4. `npm run check:boundaries`
5. `npm run verify`
