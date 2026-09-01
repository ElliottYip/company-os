# Company OS system UI redesign — verification progress

Date: 2026-09-01  
Status: complete; implementation, browser evidence and full repository verification passed

## Scope completed in code

- The public front door and the authenticated shell now inherit one Generator-derived UI family instead of selecting a separate right-pane family by locale.
- Dashboard, Agents, Work, Approvals, Governance, Usage & Billing, Organization, Accountability, Administration and Settings consume the same compact type scale, content lane, row density, border hierarchy and 4/6/8/10px shape system.
- Desktop task, Organization, Accountability and Administration pages no longer escape the shared content lane with page-local negative margins.
- Page headings use one title-casing convention. Record/task headings use the detail-title role instead of inflating to the page-title role.
- Buttons, tabs, filters, tables, cards, status labels, forms, task lists and Workforce controls consume shared visual tokens. Circular geometry remains only where the object is literally a dot, avatar or illustration element.
- Human, Agent and evidence inspection use the 560px right drawer contract. Create/edit and renewal use 576px viewport-centered modals; rejection uses the 448px safe-focus confirmation contract.
- Drawer/modal headers, bodies and sticky action areas now share a 16px density rhythm. Existing focus return, Escape, backdrop, busy and error behavior is preserved.
- Organization secondary views now use a bounded company summary, correctly aligned department actions, scan-list member rows and a one-column 1024px composition. Agent, colleague and evidence drawers share one definition-grid contract; Work, Governance and Usage summary blocks reflow at the tablet work-lane breakpoint.

## Current gap status

| Priority | Gap | State | Evidence |
| --- | --- | --- | --- |
| P0 | Product semantics, authority or safety boundary regression | 0 open | 740 Node tests passed; boundary, independence and secret checks passed. |
| P0 | Broken build/type contract | 0 open | TypeScript, production build and patch whitespace checks passed. |
| P1 | Rail/content font split | Closed in code | One inherited `SF Pro Text` / PingFang / Hiragino / YaHei chain and 400/500/600 weights, guarded by static tests. |
| P1 | Arbitrary working-surface type hierarchy | Closed in code | 20/16/14/13/12/11/10px semantic roles, guarded across primary selectors. |
| P1 | Page-local alignment and density forks | Closed in code | 1280px lane, shared insets and scan-list rows; no desktop negative page margins. |
| P1 | Misplaced Agent/detail/create overlays | Closed | Drawer/modal placement tests and fresh resized-window screenshots pass. |
| P1 | 1440/1024 Chinese/English optical acceptance | Closed | Fresh `refinement-after` evidence contains 120 captures and reports zero overflow, console, multi-dialog or focus-return failures. |

## Verification completed for this redesign

- Target typography/secondary-interaction contract suite: 23 passed, 0 failed.
- Repository Node suite: 744 total; 740 passed, 0 failed, 4 environment-gated skips.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run check:boundaries`: passed.
- `npm run check:independence`: passed.
- `npm run check:3d-assets`: passed.
- `npm run check:research`: passed.
- `npm run check:protocols`: passed.
- `npm run check:web-interactions`: passed.
- `npm run security:secrets`: passed.
- `npm run check:3d-performance`: passed.
- `git diff --check`: passed.
- Browser E2E: 33 total; 29 passed, 0 failed, 4 environment-gated Compose/IdP skips.
- Fresh evidence: 120 screenshots across 1440/1024/768/320 and Chinese/English; 144 manifest entries, zero flagged layout or interaction failures.

## Acceptance evidence

The repository-owned Playwright matrix passed against the current build. It covers list-to-detail, evidence, create, approval, rejection and renewal flows; 1440/1024/768/320 responsive layouts; Chinese and English; overlay geometry; focus return; horizontal overflow and console problems. The evidence manifest is `output/playwright/ui-consistency-refinement-after/manifest.json`.

Older `ui-consistency-*` and `generator-ui-refinement-*` captures document previous iterations. The `ui-consistency-refinement-after` set is the acceptance evidence for the current visual system.

## Boundary statement

This redesign changes presentation and client interaction only. It does not change the Company OS product model, information architecture, responsibility meaning, approval authority, exact-action binding, evidence admission, Demo/formal separation, credential handling, Runtime, production data, DNS/TLS, public cutover or deployment capability.
