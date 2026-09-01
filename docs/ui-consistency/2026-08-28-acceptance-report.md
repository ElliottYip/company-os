# Company OS / ANC UI consistency acceptance report

Date: 2026-08-28  
Scope: public front door; Demo Dashboard, Agents, Work, Approvals, Governance, Usage & Billing; local Organization detail and create flows; evidence and renewal flows; collapsed-shell navigation and 320px narrow-screen behavior  
Runtime used for visual evidence: local `public-demo`, deterministic fixtures, no external calls

## Outcome

Accepted. P0 = **0** and P1 = **0** for the audited visual and secondary-interaction scope. Product semantics, information architecture, Demo/formal safety boundaries and deployment behavior remain unchanged.

## Traceable gap closure

| Gap IDs | Result | Acceptance evidence |
| --- | --- | --- |
| VIS-001, VIS-004, VIS-008 | Closed | Shared semantic type/weight/leading/spacing/radius contracts; key page selectors are guarded by `tests/web-typography.test.ts`. |
| VIS-002 | Closed | Approval, rejection, governed trigger and renewal actions use shared primary/secondary/danger controls. |
| VIS-003 | Closed | 1024px Agent portfolio uses two columns; all four locale/viewport E2E cases assert no horizontal overflow. |
| VIS-005–VIS-007 | Closed | Compact metric strip, consistent portfolio panels and shared empty-state hierarchy. |
| INT-001, INT-002, INT-006 | Closed | Contextual detail is a deterministic right drawer; create/edit flows are centered modals; shared controller owns initial focus, Escape, backdrop, busy and return focus. |
| INT-003 | Closed | Dedicated approval review keeps immutable context and evidence visible above shared decision actions. |
| INT-004 | Closed | Public and workspace evidence records open read-only evidence drawers. |
| INT-005 | Closed | Company popover dismisses on outside pointer interaction; keyboard close is retained. |
| STATE-001 | Closed | Managed dialogs protect busy state and shared buttons expose disabled/`aria-busy` behavior; authoritative errors remain unchanged. |
| QUA-001–QUA-006 | Closed | Collapsed-shell navigation, narrow-screen dialog reference frame, rail/content typography inheritance, safety-label wrapping, bottom-nav labels and mobile Agent density are guarded by browser and static contract tests. |

## Visual evidence

- Before: `output/playwright/ui-consistency-before/manifest.json`, 40 baseline captures.
- After: `output/playwright/ui-consistency-after/manifest.json`, 60 final captures.
- Proactive quality after: `output/playwright/ui-consistency-quality-after/manifest.json`, 120 final captures.
- Deep refinement before/after: `output/playwright/ui-consistency-refinement-before/manifest.json` and `output/playwright/ui-consistency-refinement-after/manifest.json`, 120 captures each.
- Final matrix: Chinese and English at 1440×900, 1024×768, 768×1024 and 320×740.
- Final automated inspection: 0 horizontal overflows, 0 console warnings/errors, 8/8 detail-drawer focus returns, one computed font stack across rail/main, 0px viewport-center delta for every creation modal and 0px right-edge delta for every drawer.
- Key comparisons: `zh-1024-agents.png`, `en-1024-agents.png`, `zh-1024-approval-review.png`, `zh-1024-approval-evidence-drawer.png`, `zh-1024-local-human-detail-drawer.png`, `zh-1024-local-create-agent-modal.png`, and `zh-1024-token-renewal.png` in the before/after evidence directories.
- The deep refinement closes the final optical seam: Chinese is CJK-first, English remains Inter-first, ordinary content weights are limited to 450/550/650, Agents and Work share scan-list density, Governance no longer inherits a 15.21px browser heading and technical values retain safe wrapping at all four widths.

## Browser and repository verification

- Browser E2E: 29 passed, 4 environment-gated live Compose/IdP cases skipped by their existing conditions.
- UI contract E2E: 12 passed across eight public locale/viewport combinations plus representative 1440/1024/768/320 local-draft overlay flows.
- Node tests: 726 passed, 4 environment-gated cases skipped (730 total).
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run check:boundaries`: passed.
- `npm run verify`: passed end-to-end, including tests, dependency boundaries, independence, 3D asset/performance guards, research/protocol freshness, Web interaction guard, secret scan, dependency audit (0 vulnerabilities), typecheck, production build and Playwright E2E.

## Review notes

- The initial capture runner could record the front door twice because public Demo session creation is asynchronous. It now waits for the locale-specific Agent Portfolio heading before recording Dashboard evidence.
- The initial right-drawer migration exposed an Organization selector that applied 24px page margins to direct-child dialogs. Dialogs are now excluded from page-flow margins, and E2E asserts their right edge and modal center.
- A later real-window review superseded the content-lane assumption: centering against the main-content lane visibly moved every modal 120px right of the browser center and caused a jump when the rail collapsed. The current contract centers against the viewport; the compact 576px modal starts at x=224 at 1024px and x=432 at 1440px.
- Deferred animation-frame initial focus could steal focus from very fast keyboard/test input. Initial focus is now established synchronously after `showModal`; closing focus restoration remains deferred until the trigger is stable.
- Multi-worker Playwright execution completed every assertion but could retain shared Demo Web/API processes during teardown. The suite now uses one deterministic worker because all E2E cases share one Demo API process; final `npm run verify` exits cleanly with the full browser result.
