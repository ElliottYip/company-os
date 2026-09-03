# Company OS secondary-interaction contract

## Surface selection

| Interaction | Surface | Contract |
| --- | --- | --- |
| Complex, shareable record with tabs/history | Page | Tasks/Work detail, settings and long governance workflows remain page-level. Browser/back and the in-product back control return to the originating list. |
| List → contextual record inspection | Right drawer | Human, Agent and evidence detail. Preserve the list behind the overlay; 560px desktop/tablet, full-width sheet on narrow screens. |
| Short create/edit transaction | Modal | New task, add/edit department, human or Agent. Centered against the browser viewport at every shell breakpoint, max 576px, internal scrolling, explicit Cancel and primary action. |
| Approval on a dedicated review surface | Page action footer | Keep the exact target, human owner, evidence count and policy visible above shared evidence/approval actions; authoritative pending state remains on the page. |
| Rejection / irreversible confirmation | 448px confirmation modal | Show immutable target/action context and a distinct danger action. Initial focus lands on the safe Cancel action; no decision is written until explicit submit. |
| Credential renewal | 576px workflow modal | Show the credential reference and status, require a reason, keep Secret values excluded and write only after explicit submit. |
| Small anchored choice | Popover | Company switcher only. Anchor-aligned, outside-click/Escape dismissal and focus return. |
| Global search | Modal command palette | Centered, keyboard-first, Arrow navigation, Enter selection and Escape close. |
| Multi-step first-run setup | Full-page wizard | Preserve the existing dedicated setup flow and explicit progress. |

## Overlay behavior

- One overlay at a time; z-index is owned by shared tokens.
- Body/background interaction is inert while a modal or drawer is open.
- Initial focus goes to the first meaningful field for create/edit and renewal, the close control for read-only detail, or Cancel for a dangerous confirmation.
- Tab and Shift+Tab remain trapped by native `dialog` behavior.
- Escape closes non-destructive overlays. A submitting or authoritative pending state does not close.
- Closing returns focus to the exact trigger when it still exists; otherwise to the page heading.
- Page-level Task detail moves focus to its heading after navigation and returns focus to the exact originating task row when the user returns to the list.
- Cross-page contextual inspection waits for the destination page to render before opening the selected drawer; it never opens a generic first record as a timing fallback.
- Backdrop click closes read-only drawers and ordinary create/edit modals, but managed busy state blocks dismissal. Dangerous confirmation requires Cancel, close or Escape before submission.
- Drawers and modals use internal scrolling; the shell and background do not jump.
- Modal placement never depends on the navigation rail or page gutters. It uses `50vw / 50dvh` as one stable reference frame, so an open modal does not jump when the shell crosses the 860px rail breakpoint.
- Long modal forms keep their header and action footer visible while only the form body scrolls. The primary and Cancel actions remain reachable in short and narrow viewports.
- Responsive page-flow gutter selectors must explicitly exclude `dialog`; page margins may never participate in top-layer overlay placement.

## State behavior

- Loading: initiating action becomes disabled and exposes `aria-busy`; layout remains stable.
- Error: the authoritative error code remains visible and focus moves to the error summary or initiating control.
- Empty: title, concise cause and permitted next action; Demo copy never implies a real integration.
- Responsive: a drawer naturally grows to full width when the viewport becomes narrower than its 560px maximum; modal keeps a 16px viewport gutter and safe maximum height. Open overlays are continuously browser-resized through 1280, 1024, 900, 861, 860, 768, 640, 480 and 320px rather than checked only after reopening at fixed sizes.

## Safety boundary

This contract changes presentation and client interaction only. It does not change approval authority, exact-action binding, evidence admission, responsibility ownership, Demo/formal separation, credentials, Runtime, deployment or network exposure.
