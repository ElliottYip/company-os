# Product-grade current-run evidence

Date: 2026-08-24

This evidence set verifies the Company OS-owned product shell and accepted page
inventory. Paperclip at commit
`213dabab4f8e1f3bb1803a2924c0fea1289fcd4c` (MIT) was used only as an
interaction reference. Company OS does not import its Web source, branding,
private types, service, or database schema.

## Capture contract

- Desktop viewport: `1440 × 900`.
- Mobile viewport: `390 × 844`.
- English route captures: all 15 accepted sections (`office`, `inbox`, `work`,
  `goals`, `projects`, `organization`, `humans`, `agents`, `approvals`,
  `evidence`, `activity`, `responsibility`, `connectors`, `usage`, `settings`).
- Chinese focused captures: Dashboard, Organization, and Settings.
- `capture-report.json`: 42 successful captures, zero horizontal-overflow
  findings, and no capture errors.

Route files use `route-desktop-en-<section>.png` and
`route-mobile-en-<section>.png`. The numbered files retain focused workflow and
locale checkpoints.

## Comparison findings

| Interaction family | Reference pattern retained | Company OS difference |
|---|---|---|
| First run | short progressive setup and review | creates a company first; the Demo remains isolated and secondary |
| Navigation | compact grouped rail and global create | Company OS information architecture, Lucide line icons, environment boundary |
| Work | searchable list, dossier detail, activity | accountable human, exact approvals, admitted evidence and result chain |
| Organization | structure and roster projections | human principal precedes Agent; Agent always names an accountable human |
| Attention | inbox and decision routing | responsibility and risk determine who can act |
| Governance | dense tabbed administrative views | vendor-equal Connector, model/data/secret/tool/egress boundaries |
| Settings | standalone category navigation | replaceable identity, deployment profiles, security, retention, portability and locale |

The Chinese interface was edited as product copy, not translated word for
word. Product and protocol terms such as `Company OS`, `Agent`, `Connector`,
and `IdentityPort` remain stable. User-entered text, Agent output, evidence and
logs retain their original language.

## Verification

`npm run verify` passed:

- 129 unit and integration tests;
- dependency boundary, independence, asset, research and secret guards;
- strict TypeScript checking;
- production build and performance budget;
- zero audited package vulnerabilities;
- nine Playwright product E2E cases, including responsive widths.

Initial application JavaScript is 118,844 bytes raw / 33,174 bytes gzip. The
workforce graph renderer is a route-demanded chunk rather than startup cost.
