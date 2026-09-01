# Company OS / ANC deep UI refinement audit

Date: 2026-08-28  
Runtime: local `public-demo`, deterministic fixture data, no external calls  
Before evidence: `output/playwright/ui-consistency-refinement-before/`  
After evidence: `output/playwright/ui-consistency-refinement-after/`

## Why another pass was required

The previous consistency admission removed the major overlay and responsive failures, but a fresh browser comparison still confirmed the reported optical seam between the navigation rail and the content lane. The declared family was shared, yet Chinese mixed Inter and PingFang glyphs within one line; right-pane titles and values used a wider weight span; Agents, Work and Governance used different scanning densities; and a few browser-default heading and form metrics remained.

Paperclip was used only as a density and hierarchy reference: compact navigation, restrained panels, nearby visual weight between rail labels and record names, and explicit secondary surfaces. No Paperclip copy, information architecture, product semantics or runtime concept was adopted.

## Fine-grained gaps and closure

| ID | Severity | Surface | Before | Closure |
| --- | --- | --- | --- | --- |
| REF-001 | P1 | Chinese rail and content | Inter rendered Latin/numerals while PingFang rendered CJK inside the same line, producing different glyph proportions. | Chinese now uses a CJK-first root stack; English retains Inter-first. Rail and main inherit the same locale-aware stack. |
| REF-002 | P1 | Agents | Three independent cards per row amplified 11/12/13/14px and 450/650/720 contrasts. | Replaced the card grid with one scan-first bordered record list. Titles, owner, badges and management-boundary fields use explicit semantic roles. |
| REF-003 | P1 | Add Agent and other creation flows | The modal reference frame changed at the shell breakpoint and form controls retained browser-dependent metrics. | Modal is centered in the browser viewport independently of the rail; controls use shared radius, size, weight and leading contracts; browser tests assert geometry, continuous resize, initial focus, Escape and focus return. |
| REF-004 | P2 | Agents at 1440/1024/320 | Long management enums wrapped in arbitrary fragments and competed with record names. | Rebalanced desktop columns, switched tablet fields to a two-column detail grid, lowered technical values to the supporting role and inserted safe wrap opportunities at enum separators without changing values. |
| REF-005 | P2 | Work | Two large independent cards created excess whitespace and a different rhythm from Agents. | Work records now share one bordered list, row dividers and compact metadata/action spacing. |
| REF-006 | P2 | Governance | Unstyled `h3` elements computed to the browser default 15.21px; four badges stacked vertically and stretched all cards. | Governance headings use the 14px section token, badges share wrapping rows and cards align to their content height. |
| REF-007 | P2 | Usage & Billing | Renewal metadata used label-size copy and inherited broader card shape. | Renewal metadata uses the supporting role; cards, buttons and radii use shared primitives. |
| REF-008 | P2 | Organization/detail/evidence | Page descriptions, roster metadata, detail definition lists and safety copy still used undersized labels and legacy blue-gray colors. | Promoted readable/safety text to body or supporting roles and migrated the audited surfaces to semantic ink/line/surface tokens. |
| REF-009 | P2 | Whole shell | Control radius 12px and panel radius 14px made ordinary surfaces more rounded than the scan-oriented reference. | The hierarchy is now 6px compact, 8px control, 10px panel and 12px overlay; pills remain fully rounded. |

## Final measured contract

- Chinese root: `PingFang SC`, `Microsoft YaHei`, Inter, sans-serif.
- English root: `Inter Variable`, Inter, `PingFang SC`, `Microsoft YaHei`, sans-serif.
- Rail and ordinary content: 13px; section/record title: 14px; page title: 18px; supporting content and technical values: 12px; metadata label: 11px; metric: 24px.
- Ordinary weights are 450/550/650. The former 720 content weight is removed; headings and major metrics use 650.
- Agents at 1440px use one record row with four technical fields; 1180px and below use two field columns; narrow screens retain every field and safe enum wrapping.

## Admission evidence

- 120 before and 120 after screenshots: Chinese and English at 1440×900, 1024×768, 768×1024 and 320×740.
- All requested public pages plus approval review, evidence drawer, token renewal, local Organization, human detail and Agent/task creation states are represented.
- Final manifest: zero page-level horizontal overflows and zero console warnings/errors.
- Browser contract: 12/12 locale/viewport cases passed, including computed typography, viewport modal centering, right-edge drawer geometry, continuous resize, initial focus, Escape and trigger focus return.
- P0 = **0**, P1 = **0**. Remaining fixed mobile navigation overlap in full-page screenshots is a screenshot artifact of a viewport-fixed control; live browser assertions confirm reachable vertical content and no horizontal clipping.

## Boundary record

No product model, information architecture, approval authority, exact-action binding, evidence admission, responsibility ownership, Demo/formal separation, credential, Runtime, production data, DNS/TLS or deployment behavior changed. No vendor or Paperclip concept entered `core`, `ports` or `application`.
