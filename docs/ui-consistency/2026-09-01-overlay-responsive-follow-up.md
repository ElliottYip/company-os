# Company OS overlay responsive follow-up

Date: 2026-09-01  
Scope: command palette, Add Department/Human/Agent, New Task, Agent/Human/Evidence detail, rejection confirmation, credential renewal and responsive resizing  
Runtime: local deterministic public Demo; no external calls, credentials or formal Runtime changes

## Runtime findings

| ID | Severity | Finding | Before evidence | Closure |
| --- | --- | --- | --- | --- |
| OVR-001 | P1 | Shared Modal placement used the 240px navigation rail as a left inset. Every desktop Modal was therefore 120px right of the browser center. | `03-command-palette-before-1440.png`; center delta +120px. | `.family-modal` now uses fixed `top/left: 50%` plus `translate(-50%, -50%)`; every Modal uses the viewport as its only reference frame. |
| OVR-002 | P1 | An open Modal jumped when resizing from 861px to 860px because the shell removed the offset at that breakpoint. | `before-add-agent-861x760.png` and `before-add-agent-860x760.png`. | Continuous resize sweep reports 0px horizontal and vertical center delta at 1280, 1024, 900, 861, 860, 768, 640, 480 and 320px. |
| OVR-003 | P1 | At 320x640, the Add Agent footer touched the viewport edge and could obscure the final field/actions during internal scrolling. | `before-add-agent-320x640.png`. | Editor forms own internal scrolling with sticky header and action footer. The primary action bottom is 605px in a 640px viewport. |
| OVR-004 | P2 | Drawer full-width behavior switched abruptly at an unrelated 760px shell breakpoint. | `before-agent-drawer-768x760.png` and `before-agent-drawer-760x760.png`. | Drawer width is `min(560px, 100vw)`, remains right-aligned, and reaches full width continuously at 560px. |
| OVR-005 | P1 | Fixed-size E2E reopened overlays after each viewport change and could not detect movement while an overlay remained open. | Previous helper asserted content-lane centering only. | E2E now keeps Add Agent open while resizing through nine widths and asserts horizontal/vertical centering plus action visibility at each size. |

## Interaction contract after remediation

- Modal: viewport centered, 16px minimum gutter, safe `100dvh` maximum, internal scroll, persistent close/actions.
- Confirmation: same viewport contract with a 448px maximum and initial focus on Cancel.
- Drawer: fixed to the viewport right edge, 560px maximum, naturally full width at and below 560px.
- Popover: remains trigger-anchored; it does not share Modal positioning.
- Wizard: remains a dedicated full-page flow.
- All native dialog dismissal, busy protection, focus trap, Escape behavior and focus return remain unchanged.

## Evidence

Accepted screenshots are in `output/overlay-responsive-audit-2026-09-01/`. The key after states are:

- `after-add-agent-1440x900.png`, `after-add-agent-861x760.png`, `after-add-agent-860x760.png`, `after-add-agent-320x640.png`;
- `after-command-palette-1440.png`;
- `after-evidence-drawer-1440x900.png`, `after-evidence-drawer-561x700.png`, `after-evidence-drawer-560x700.png`;
- `after-reject-modal-1440.png`;
- `after-renewal-modal-1440x900.png`, `after-renewal-modal-320x600.png`;
- `after-new-task-modal-1440x900.png`, `after-new-task-modal-320x600.png`.

## Boundary record

No product model, information architecture, responsibility or approval meaning, evidence admission rule, Demo/formal boundary, credential handling, Runtime, deployment, DNS/TLS or public traffic behavior changed.
