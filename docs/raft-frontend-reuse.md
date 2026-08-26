# Raft frontend reuse map

Company OS and Raft are separate products in one visual family. Company OS may
reuse Raft frontend source under Apache-2.0, but must keep a repository-owned
copy: there are no runtime imports, filesystem links, or domain dependencies on
Raft.

## Reuse by default

| Frontend information | Raft source | Company OS target | Rule |
|---|---|---|---|
| Color, radius, spacing, shadow, typography | `web/src/features/company-os/styles/raftCompanyOs.css` | `web/family-ui.css` | Copy the contract; rename only to neutral family primitives |
| Buttons and focus/disabled states | `raftCompanyOs.css`, `web/src/shared/ui/button.tsx` | `.family-button*`, `web/components/button.ts` | Keep sizes, weights, borders and state behavior |
| Panel and elevation | `raftCompanyOs.css` | `.family-panel*` | Use for cards, drawers, inspectors and data sections |
| Status labels | `raftCompanyOs.css` | `.family-status*` | Keep semantic neutral/working/approval/blocked/complete mapping |
| App-shell styling | Buzz product screenshots and `CompanyOsShell.tsx` | `web/mount.ts`, `web/styles.css` | Keep the pale rail, continuous white surface, compact controls and warm selected state |
| Navigation icons | `CompanyOsShell.tsx` / Lucide vocabulary | inline owned SVGs in `web/mount.ts` | Reuse icon meaning without adding a framework dependency |
| Demo warning bar | `web/src/features/company-os/demo/DemoOfficePage.tsx` | `.family-banner*` | Keep warning hierarchy; replace product copy only |
| Page headers and metrics | `AgentBossPage.tsx` | `web/components/raft-ui.ts`, `.family-page-*`, `.family-metric-strip` | Reuse title, copy, actions, status and four-cell metric composition |
| List rows and facts | Agent, Connector, Work, Responsibility and Governance pages | `.family-list`, `.family-list-row`, `.family-data-grid` | Reuse border and density rules |
| Form controls | shared form patterns | `.family-field`, `.family-control` | Reuse focus, border, radius and label hierarchy |
| Fish motion and treatment | `raftCompanyOs.css`, `RaftFishAvatar.tsx` | Company OS office renderer | Reuse motion language and approved copied assets |

## Change only content

- Product name, company name, navigation labels and explanatory copy.
- Business data, permissions, responsibility records and connector state.
- Routes and host callbacks.

## Company OS-owned frontend

- Office scene projection and renderer.
- Responsibility-chain visualization.
- Work/approval state-machine projections.
- Connector and governance projections.

The complete inspected surface map is in `docs/raft-frontend-inventory.md`.
New pages should compose `family-*` primitives before adding page-specific CSS.
If a missing pattern already exists in Raft, receive it into `web/family-ui.css`
and update `docs/source-manifest.md` instead of recreating it locally.

## Functional arrangement boundary

Paperclip's `product-navigation-layout--board-chrome-matrix` Storybook story is
the arrangement reference for the company switcher, quick-create/search entry,
grouped sidebar navigation, breadcrumbs, command palette, and five-slot mobile
navigation. These structures are implemented with Company OS data and actions;
their colors, borders, typography, selected states and surfaces remain governed
by the Buzz/Raft reception above.
