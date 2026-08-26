# Marvis-layout office design QA

- Source visual truth: `/var/folders/d5/qf037ql51nl8w1k4vnn70w7w0000gn/T/TemporaryItems/NSIRD_screencaptureui_IzghkR/截屏2026-08-21 17.45.25.png`
- Implementation screenshot: `/tmp/company-os-marvis-implementation-1011x851-final.png`
- Full-view comparison: `/tmp/company-os-marvis-pixel-compare-final.png`
- Focused chair/actor comparison: `/tmp/company-os-marvis-chair-focus-final.png`
- Browser viewport: 1600 × 1200 CSS px
- Comparison region: 1011 × 851 CSS px at device scale 1
- Source pixels: 1011 × 851
- Implementation pixels: 1011 × 851
- Density normalization: none required; both artifacts were compared at 1:1 pixels
- State: deterministic Demo fixture, one accountable human, two explicitly labelled Demo Agents

## Findings

- 2026-08-23 correction: the earlier coordinate match did not prove physical
  scale. Furniture had been sized from canvas percentages, so transparent
  padding distorted the visible ratios. The current pass calibrates every
  module against the 1600 mm desk anchor and measured alpha bounds; see
  `docs/office-real-scale.md`.
- Typography: actor labels preserve Company OS Chinese names and structured states rather than copying Marvis copy. Their placement follows the reference hierarchy above the actor/monitor.
- Spacing and layout: the fixed 1011 × 851 world uses the reference's three-row, two-column workstation grid and left utility column. Workstation centers, row cadence, and negative space now track the reference.
- Colors and tokens: the reference's white/black palette is intentionally replaced by Company OS warm clay furniture, Raft fish colors, and existing neutral UI tokens.
- Image quality: all visible furniture, chair, human, fish, and utility areas are raster assets. No CSS or placeholder art substitutes are used. The chair is a separate transparent asset layer.
- Copy: Company OS retains Chinese accountable-human and Demo-fixture terminology; no Marvis product or character names were copied.

## Comparison history

1. Pass 1 — blocked: the desk and chair layers both rendered above the actor, hiding the seated human. The desk depth was moved behind the actor and workstation desk occluders were removed.
2. Pass 2 — blocked: the stage viewport clipped the lower row, furniture scale was low, and the side task card reduced the office width. The world was fixed to 1011 × 851, the stage height was set to 851 px, the task card moved below the office, desks increased to 25%, and utility assets were resized to match the reference regions.
3. Pass 3 — blocked: the default two-Agent state put one Agent in the top-right seat instead of the reference-style collaboration cluster. Default placement now uses one working Agent at the middle-left desk and one side-view visitor beside it.
4. Pass 4 — partial: the human and working fish sit behind the independent chair layer and all three rows render without clipping, but furniture scale was still percentage-based.
5. Pass 5 — passed for scale and locomotion: desk, 2400 mm coffee run, balcony composition and restroom envelope now share one physical scale. Browser sampling during a desk-to-restroom route produced eight distinct intermediate positions over 1.28 seconds; actor, label and depth order advanced on every frame instead of jumping at route nodes.

## Primary interactions checked

- Keyboard and pointer panning remain available on the office stage.
- Actor selection, free-floor movement, destination movement, paired conversation state, and responsibility-tree switching remain wired.
- Human walking and fish swimming now use frame-by-frame spatial interpolation with distance-based timing and smooth acceleration/deceleration.
- Console inspection found no new rendering error during the final comparison capture.

## Follow-up polish

- P3: produce additional Company OS utility assets with the same large soft-shadow footprint if a closer object-for-object match to Marvis's treadmill/cat zones is desired.
- P3: tune actor-specific label offsets once more character silhouettes are admitted.

final result: passed for relative scale, chair occlusion, and continuous locomotion; future art-direction comparisons must not be described as pixel-perfect copies of Marvis.

## Product shell and onboarding QA — 2026-08-24

- Source visual baseline: user-owned Generator Web at revision
  `a66c8996cb6150da3a2da5a5026efe771942583d`; the detailed provenance and
  reuse boundary are in `docs/source-manifest.md`.
- Implementation screenshot:
  `outputs/ux-audit-2026-08-24/05-organization-studio.png`.
- Verified viewport: 1440 × 900 CSS px at device scale 1; scroll width equals
  viewport width.
- Browser console: no warnings, errors, or page errors during capture.
- Interaction verification: non-blocking first-run panel, organization route,
  add-human dialog, add-Agent dialog, accountable-human selection, global New
  Task dialog, mobile navigation and command palette all passed E2E.
- Boundary verification: Demo edits remain in-memory fixtures and reset to the
  canonical organization. Formal organization mutation fails closed until its
  authenticated command endpoint exists.

final result: passed for the first product-experience slice; this is a functional
foundation, not a claim that the remaining Agent Boss administration pages are
feature-complete.

## Page-by-page product workflow QA — 2026-08-24

- Upstream evidence groups: onboarding; organization/Agents; tasks/timeline;
  decisions/approvals; artifacts/secrets/tools/settings. Each group records
  valid rendered captures plus source/API ownership in
  `docs/paperclip-ui-extraction/`.
- Company OS browser flows verified: five-step setup; add accountable human;
  add Demo Agent; organization tabs and detail; global task creation; task
  detail/activity/evidence/responsibility tabs; exact approval binding;
  approve/reject; Connector/model/data/Secret/tool/egress administration tabs.
- Mobile checks use 320 px and 390 px widths. Horizontal overflow assertions
  cover the product shell, organization roster and scrollable administration
  tabs.
- Demo empty states never imply a real Agent, model, credential, tool, data
  source or egress operation.
- The administration UI does not synthesize missing production capability:
  absent tool-profile APIs remain visibly default-deny instead of becoming a
  browser-only permission model.

final result: passed for the scoped onboarding, organization, task, approval,
evidence and governance workflows, subject to the full repository verification
recorded by the delivery command.

### Final rendered-page review

- Desktop captures: `06-organization-workspace-final.png`,
  `07-task-record-final.png`, and `08-administration-secrets-final.png` under
  `outputs/ux-audit-2026-08-24/`.
- Mobile capture: `09-administration-mobile-final.png` at 390 × 844 CSS px.
- All four captures report document scroll width equal to viewport width; no
  page-level horizontal overflow or browser page error was observed.
- Desktop review passed for shell proportions, content hierarchy, task property
  separation, explicit Demo labelling, and governance empty-state clarity.
- The mobile administration tab strip intentionally scrolls to keep the active
  tab visible. Earlier tab text may therefore be clipped at the strip edge;
  content and the page shell do not overflow.
- The repeatable capture is `node scripts/capture-product-visual-qa.mjs` while
  the local app is served at `http://127.0.0.1:8129` (override with
  `COMPANY_OS_QA_URL`).

final rendered-page result: passed for the scoped desktop and mobile product
surfaces.

## Dashboard redesign QA — 2026-08-24

- Paperclip behavior source and Company OS mapping:
  `docs/paperclip-ui-extraction/00-shell-dashboard.md`.
- Desktop capture: `outputs/ux-audit-2026-08-24/10-dashboard-redesign-final.png`.
- Mobile capture: `outputs/ux-audit-2026-08-24/11-dashboard-redesign-mobile.png`.
- The first viewport now prioritizes accountable humans, pending human
  decisions, active work, responsibility evidence and recovery actions. The
  relationship graph and chronological activity remain available below.
- Both captures report document width equal to viewport width. The dashboard
  action routes, global task dialog and team route passed focused E2E.
- Paperclip page code, API clients, shared types, brand and copy are absent;
  only the upstream triage hierarchy was extracted.

final Dashboard result: passed for desktop and mobile implementation review.
