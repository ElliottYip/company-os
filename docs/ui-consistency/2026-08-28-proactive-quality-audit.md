# Company OS / ANC proactive UI quality audit

Date: 2026-08-28  
Runtime: local `public-demo`, deterministic fixture data, no external calls  
Evidence: `output/playwright/ui-consistency-quality-before/` and `output/playwright/ui-consistency-quality-after/`

## Why this follow-up existed

The first consistency pass closed the requested 1440px and 1024px findings, but a fresh whole-product browser audit found that the contract was not yet complete below the rail-collapse breakpoint. It also confirmed the reported left-rail/right-content type fracture: the rail was tokenized while the content lane still contained browser-inherited defaults and locally chosen sizes and weights.

Paperclip was used only as an interaction-density and hierarchy reference: a stable rail, compact scan surfaces, restrained panels and explicit secondary surfaces. Company OS copy, information architecture, governance meaning and runtime boundaries remain independent.

## Follow-up gaps and closure

| ID | Severity | Surface | Runtime evidence | Closure |
| --- | --- | --- | --- | --- |
| QUA-001 | P1 | Public Demo at 860px and below | Collapsing the desktop rail removed direct access to Agents, Approvals, Evidence, Governance and Usage & Billing. | Added a six-destination portfolio bottom navigation with complete accessible names and compact visible labels. The Company brand remains the Dashboard return path. |
| QUA-002 | P1 | Add Agent, Add Human, Add Department and task creation at 860px and below | Responsive page-gutter selectors also matched direct-child `dialog` elements, overriding modal auto margins and moving creation surfaces to the left page gutter. | Excluded `dialog` from page-flow gutter rules. A later real-window follow-up moved the stable reference frame to the browser viewport at every audited width. |
| QUA-003 | P1 | Rail versus all right-content surfaces | The right pane had no inherited base type contract and still mixed local 9/11/12/13/16px sizes and 600/700 weights. The computed hierarchy differed from the rail even when the declared family happened to match. | Added one inherited family/body/weight/leading contract, semantic heading/strong defaults, completed leading tokens and migrated customer-facing page selectors to semantic size and weight roles. |
| QUA-004 | P1 | 320px public Demo header and page title | The session-safety label was ellipsized and the page-level no-external-call badge compressed into a near-circle beside the title. | Made the topbar safety label wrap without truncation and stacked the page safety badge below the title copy on narrow screens. |
| QUA-005 | P2 | 320px public Demo bottom navigation | Long visible labels touched or appeared merged. | Kept full accessible names while using stable short visible labels at the six-column breakpoint. |
| QUA-006 | P2 | 320px Agents | Agent management-boundary cards were readable but unnecessarily tall. | Reduced mobile card padding and gaps while retaining every responsibility, privacy, runtime and lifecycle field. |

## Final admission

- P0: **0**.
- P1: **0**.
- Final matrix: Chinese and English at 1440×900, 1024×768, 768×1024 and 320×740.
- 120 final screenshots, 0 page-level horizontal overflows and 0 browser console warnings/errors.
- One computed font stack across rail and main content: `Inter Variable`, `Inter`, `PingFang SC`, `Microsoft YaHei`, sans-serif.
- Create Agent and Create Task modal viewport-center delta: **0px** in every locale/viewport combination and throughout an open-dialog continuous-resize sweep.
- Detail and evidence drawers: right-edge delta **0px**; 320px uses a full-width sheet.
- Human-detail close returns focus to the exact trigger in all eight locale/viewport combinations.

Controls below the initial 320px local Organization viewport are ordinary document content and remain reachable by vertical scrolling; no overlay, fixed navigation or horizontal clipping obscures them.
