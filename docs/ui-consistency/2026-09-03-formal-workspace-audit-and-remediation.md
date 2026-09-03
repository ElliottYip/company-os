# Company OS formal workspace audit and remediation

Date: 2026-09-03

Scope: Dashboard, Inbox, Tasks, Goals, Projects, Organization, Humans, Agents, Approvals, Evidence, Activity, Accountability, Governance, Usage & Billing, Settings, and their primary secondary flows

References: current runnable Company OS, Generator source and visual guidance, Paperclip density patterns only

Boundary: UI and Web-adapter behavior only; no domain semantics, authority, credential, production data, DNS/TLS or formal Runtime changes

## Evidence-led findings

| ID | Severity | Surface | Finding | Remediation |
| --- | --- | --- | --- | --- |
| WS-001 | P0 | Public deployment | anc.raft.xin was serving an older Web bundle even though a newer candidate had passed acceptance. The live CSS still used the former type stack, white canvas, pill geometry and old overlay placement. | Release images now carry a source-bound build-manifest.json; release qualification verifies the OCI revision, source revision and hashed Web assets before publication. Public acceptance can assert the expected source revision. |
| WS-002 | P1 | Dashboard | The no-eligible-Agent state fell back to unrelated English/browser typography; event time, code, summary and environment badge did not share a scan baseline. | Localized the empty state, applied the semantic supporting role, and rebuilt event rows as an explicit aligned grid with mono timestamps/codes and square status geometry. |
| WS-003 | P1 | Goals / Projects | Creation fields and the primary button expanded as independent blocks, leaving most of the page unused and making one action visually dominate the records. | Both forms now use the shared compact catalog toolbar: four columns on desktop, two at 1024px, one on narrow screens, with one fixed-height action. |
| WS-004 | P1 | Usage & Billing | The budget save action stretched to a large dark rectangle beside a narrow field stack. | Budget fields now use a three-column grid and a separate fixed-height action; tablet and mobile reflow without changing policy semantics. |
| WS-005 | P1 | Governance / Settings | Nested form grids caused outer CSS grid auto-placement to stretch action buttons through the remaining panel height. Settings tabs also became a clipped horizontal strip at tablet width. | Nested forms now own one full-width field grid plus an independent action. Settings tabs wrap at tablet width and expose matching horizontal keyboard semantics. |
| WS-006 | P1 | Organization / Humans | A single department occupied half a canvas; a Humans row navigated to Organization but lost the selected person before the drawer could open. | Department columns use content-aware auto-fit. Cross-page detail navigation now awaits the target render and opens the exact selected Human drawer. |
| WS-007 | P1 | Tasks | Empty task lists occupied most of the viewport. Task detail opening and closing did not establish a stable keyboard return point. | Empty-list height is bounded. Opening detail focuses the record title; closing returns to the originating task row. |
| WS-008 | P1 | Approval / lifecycle danger actions | Goal/project cancellation and archive, plus formal rejection, could mutate immediately from a dense row. | These actions use the shared confirmation modal with immutable context, safe initial focus, Escape/backdrop rules and exact focus return. Authority and API meanings are unchanged. |
| WS-009 | P1 | Evidence | Digest, source and time were concatenated into one ellipsized prose line. | Evidence rows expose separate digest, source and timestamp fields; technical values use the mono contract and stack at narrow widths. Detail remains a read-only right drawer. |
| WS-010 | P1 | Navigation performance | Every page switch rebuilt the full shell after nine remote reads; three reads independently fetched the same /agent-boss projection. Slow WAN responses made routine navigation take roughly 1.0–1.7 seconds and stale responses could win a rapid-navigation race. | The Web reuses one workspace projection, shares in-flight requests, deduplicates the Agent Boss projection, refreshes stale data in the background, invalidates after mutations, and discards stale render generations. A local accepted switch measured 269ms including browser automation overhead. |

## Page and secondary-flow coverage

| Area | Primary page | Secondary flows audited |
| --- | --- | --- |
| Work | Dashboard, Inbox, Tasks, Goals, Projects | list → task detail → tabs → return; search/filter/sort; new task; goal/project create; cancel/archive confirmation |
| Company | Organization, Humans, Agents | department/human/Agent creation; Human/Agent drawers; cross-page Human selection; Agent lifecycle and responsibility controls |
| Governance | Approvals, Evidence, Activity, Accountability | review evidence drawer; approve/reject; rejection confirmation; evidence technical metadata; event chronology; responsibility views |
| Administration | Governance, Usage & Billing, Settings | policy/forms; credential renewal; budget policy; settings tabs and keyboard navigation; company profile |
| Public Demo | Dashboard, Agents, Work, Approvals, Governance, Usage & Billing, Evidence | governed workflow; evidence review; rejection; token renewal; responsive collapsed navigation |
| Entry | Public front door | Chinese/English typography and the reused moving Generator fish asset at desktop/tablet |

## Token and interaction contracts

The accepted type, spacing, radius, surface, wrapping and responsive rules remain authoritative in [visual-token-contract.md](./visual-token-contract.md). The accepted page/drawer/modal/popover selection, focus, keyboard, dismissal, scrolling and state behavior remain authoritative in [secondary-interaction-contract.md](./secondary-interaction-contract.md).

This pass adds two explicit rules:

1. Technical record metadata is structured into semantic fields before truncation; normal prose is never used as a container for digest + source + time.
2. Page-level detail navigation moves focus to the detail heading and restores it to the exact originating row on return. Cross-page drawer navigation awaits the destination render before opening the selected record.

## Verification

- npm run typecheck: passed.
- npm run build: passed; final RC31 assets are CSS index-C3jPEJe0.css and JS index-BZAGj_E-.js.
- npm test: 761 passed, 4 skipped, 0 failed.
- npm run check:boundaries: passed.
- Focused UI/deployment tests: 49 passed, 0 failed.
- npm run test:e2e -- tests/e2e/ui-consistency.spec.ts: 13 passed, covering English and Chinese at 1440, 1024, 768 and 320px; modal centering, drawer placement, focus return, Escape behavior, fish playback and overflow checks.
- In-app browser: local workspace pages were walked from a fresh five-step setup; Settings switch measured 269ms and secondary-page structure was inspected after the cache fix.
- npm run verify: passed end-to-end. The final browser phase ran 36 tests: 31 passed, 5 environment-gated suites skipped, 0 failed.
- The authenticated production browser reached Dashboard, Goals, Usage & Billing, Organization, Agents, Tasks and Settings after promotion. Cached page-title visibility measured 288–293ms including browser automation overhead.
- At the 1000 × 906 live browser viewport, the Add Agent modal measured 576 × 626px, was centered to 0px delta on both axes and had no viewport overflow. The Human detail drawer measured 560 × 906px, was pinned to the right edge and had no overflow.

## Visual evidence

Before evidence includes the user-marked production screenshots and output/ui-audit-2026-09-03-live-before/01-usage-1488.jpg.

Accepted local after evidence:

- output/ui-audit-2026-09-03-after/01-organization-1488.jpg
- output/ui-audit-2026-09-03-after/02-add-agent-modal-1488.jpg
- output/ui-audit-2026-09-03-after/03-goals-1488.jpg
- output/ui-audit-2026-09-03-after/05-usage-stable-1488.jpg
- output/playwright/ui-consistency-refinement-after/ for the complete 1440/1024 Chinese/English secondary-flow matrix

Accepted production RC31 evidence:

- output/ui-audit-2026-09-03-live-after-rc31/01-settings-1000.png
- output/ui-audit-2026-09-03-live-after-rc31/02-goals-1000.png
- output/ui-audit-2026-09-03-live-after-rc31/03-usage-1000.png
- output/ui-audit-2026-09-03-live-after-rc31/04-add-agent-modal-1000.png
- output/ui-audit-2026-09-03-live-after-rc31/05-human-drawer-1000.png

## Release acceptance

- RC30 qualification and publication succeeded, but its first production browser probe rejected the existing formal access projection because the Web client accepted OIDC only while the verified production identity adapter reports generic OAuth2. The Web-only change was immediately rolled back to the preserved compose backup; the previous container returned healthy before compatibility work continued.
- The compatibility repair accepts only the explicit `OIDC` and `OAUTH2` protocol values while retaining the existing authenticated-session, capability and blocker invariants. A regression test covers the production-shaped OAuth2 access projection. No vendor name or credential is introduced into core/application behavior.
- RC31 release: `v0.1.0-rc.31`; source revision `d39f72ad3ded18f28188104f63b136fb5b3987f9`; qualification run `33714871782`, qualify and publish both successful.
- Promoted Web image: `ghcr.io/elliottyip/company-os-web@sha256:7b5c0f43baa5ec9c86ab484cab14ad6e5fd3bb20ac23df9bcf732db1ed8004e8`.
- Public HTML serves `index-C3jPEJe0.css` and `index-BZAGj_E-.js`. Public `build-manifest.json` reports the same RC31 source revision.
- Only the formal compose `web.image` line changed. API, database, credentials, identity configuration, Nginx, DNS/TLS, traffic boundary and Runtime remained unchanged. The promoted Web container is running and healthy.
