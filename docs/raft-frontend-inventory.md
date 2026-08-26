# Buzz/Raft frontend reception inventory

Reference task: `019fef5f-8fdb-71a1-9b8e-b57612de319b`
Source repository: `/Users/elliottye/Documents/Codex/2026-07-22/block-buzz-https-github-com-block/outputs/raft`
Reception boundary: Company OS owns its copy; there are no runtime imports or
filesystem links to Buzz/Raft.

## Received design system

| Buzz/Raft source | Received Company OS surface | Status |
|---|---|---|
| `web/src/features/company-os/styles/raftCompanyOs.css` | `web/family-ui.css` | Tokens, buttons, status, focus, panel and office motion received |
| `web/src/shared/ui/button.tsx` | `web/components/button.ts` | Primary, secondary, quiet, danger and disabled behavior received without React/Radix/CVA |
| `web/src/shared/ui/badge.tsx` | `web/components/raft-ui.ts`, `.family-status*` | Semantic status variants received |
| `web/src/shared/ui/card.tsx` | `.family-panel`, section headers and flat page cards | Composition received without framework dependency |
| `web/src/shared/ui/input.tsx` | `.family-field`, `.family-control` | Label, border, focus and disabled grammar received |
| `web/src/features/company-os/ui/CompanyOsShell.tsx` plus the four repository screenshots | `web/mount.ts`, `web/styles.css` | Continuous workspace shell, dense rail, compact toolbar, inset white content surface, mobile rail and footer utilities received |
| `web/src/features/company-os/ui/CompanyOsEmptyPage.tsx` | Family empty/loading/error pattern | Centered narrow state and single-action hierarchy received |

## Received page grammar

| Buzz/Raft source | Pattern | Company OS use |
|---|---|---|
| `AgentBossPage.tsx` | Compact page header, paired actions, four-cell metric strip, responsive card grid | Page headers and operating metric strip across all four sections |
| `CompanyWorkPage.tsx`, `WorkTaskDrawer.tsx`, `ExternalWorkDrawer.tsx` | Work-centered composition, evidence/activity detail and contextual actions | Work page keeps goal, state, events and responsibility in one two-column workspace |
| `ApprovalInboxPage.tsx` | Attention-first warning and exact decision context | Approval state uses one warning band and bound facts inside the work card |
| `ResponsibilityLedgerPage.tsx`, `ResponsibilityLedgerEntryCard.tsx`, `ResponsibilityAttentionPanel.tsx` | Responsibility chain, audit facts and attention state | Responsibility page and reusable compact responsibility panel |
| `AgentConnectorStudioPage.tsx`, `AgentConnectorCatalog.tsx`, `AgentDeploymentEditor.tsx`, `AgentRecoveryPanel.tsx` | Connector list rows, runtime status, deployment and recovery notices | Connector catalog, semantic status rows and boundary note |
| `ModelDataStudioPage.tsx`, `GovernanceCatalog.tsx`, `GovernanceEditorPanel.tsx` | Governance metrics, policy rows and form density | Formal connector/governance projection |
| `BusinessProjectsPage.tsx` | Project list/card density and restrained metadata | Used as the list/card density baseline |
| `CompanySetupPage.tsx` and setup step editors | Progressive form sections, labels, controls, review state | Formal assignment form primitives |
| `CompanyOfficePage.tsx`, `DemoOfficePage.tsx`, `DemoAgentPanel.tsx` | Office as a primary surface with contextual operational detail | Independent office renderer plus persistent current-work context |

## Screenshot-grounded shell pass

The second reception pass inspected the committed Buzz product screenshots,
not only the Company OS TSX sources:

- `docs/assets/screenshots/channel-thread.png`
- `docs/assets/screenshots/channel-agents.png`
- `docs/assets/screenshots/create-channel.png`
- `docs/assets/screenshots/media-comments.png`

Those screenshots changed the visual target from a generic dashboard to Buzz's
actual working surface: a pale grey-green workspace rail, one continuous white
content plane, a compact page toolbar, dense navigation, thin tool borders,
list/activity-led information, and restrained use of cards. The screenshot
files remain in the source repository and were not copied into Company OS.

## Deliberately not copied

- React, TanStack Router, Tailwind, Radix, CVA, Sonner and vendor libraries.
- Raft identity, Nostr, relay, event-kind, private-session or Connector runtime
  implementations.
- Product routes that Company OS does not yet implement.
- Domain objects from Buzz/Raft. Only Web composition and visual behavior are
  received.

## Rule for new Company OS pages

New pages must first compose `family-page-header`, `family-metric-strip`,
`family-panel`, `family-section-header`, `family-list`, `family-status`,
`family-button`, and `family-control`. A new page-specific visual primitive is
allowed only after the corresponding Buzz/Raft pattern is checked and this
inventory is updated.
