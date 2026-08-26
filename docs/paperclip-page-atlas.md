# Paperclip page atlas

Captured locally from the Paperclip `0.3.1` source checkout on 2026-08-20.
These images are reference-only audit artifacts. No Paperclip code or visual
asset is shipped by Company OS.

## Valid capture set

All desktop images use a `1440 × 900` viewport. Mobile images use `390 × 844`.
Content was allowed to finish loading before capture; viewport screenshots are
used instead of Storybook's very tall product matrices.

| Surface | Desktop reference | Mobile reference | Company OS mapping |
|---|---|---|---|
| Navigation | `reference/desktop-sidebar.png` | — | Company selector, quick actions, grouped navigation |
| Inbox | `reference/desktop-inbox.png` | — | Inbox / approvals |
| Decisions | `reference/desktop-decisions.png` | `reference/mobile-decisions.png` | Approval decision cards and filter tabs |
| Agent detail | `reference/desktop-agent-detail.png` | `reference/mobile-agent-detail.png` | Dashboard hierarchy, tabs, metrics and recent work |
| Timeline | `reference/desktop-timeline.png` | — | Chronological evidence/activity feed |
| Routines | `reference/desktop-routines.png` | — | Dense operational list rows |
| Artifacts | `reference/desktop-artifacts.png` | `reference/mobile-artifacts.png` | Filter tabs and grouped results |
| Secrets | `reference/desktop-secrets.png` | — | Administration page grammar |
| Tool access | `reference/desktop-tools.png` | `reference/mobile-tools.png` | Connector/access catalog grammar |

The earlier `fullPage` matrix captures in the same audit directory are invalid
for visual comparison: several represent multi-state canvases rather than real
pages, and some were captured during suspense loading. They are excluded from
all implementation decisions.

## Reused layout grammar

- Compact company-scoped rail with quick actions and small section labels.
- Page title and plain-language description followed by horizontal tabs.
- Low-border-density content: lists, activity rows and detail panes, not a grid
  of unrelated promotional cards.
- `12–14px` operational copy, `20–24px` page titles, and explicit line heights.
- Mobile content stacks in reading order; fixed navigation uses five equal slots.

Buzz remains the visual source for the pale green rail, white workspace, button
shape, border color and status treatment.
