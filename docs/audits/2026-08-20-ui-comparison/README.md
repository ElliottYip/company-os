# Company OS / Raft / Paperclip UI comparison

> Superseded for the Raft comparison. The user clarified that “Raft” means the
> Buzz project’s `/agents` Agent Boss surface, not the `/demo/office` page used
> in this report. See `../2026-08-20-buzz-agent-comparison/README.md`.

Viewport: 1440 × 900. Captured locally on 2026-08-20.

## Verdict

The current Company OS UI is not a faithful reproduction of either reference. It combines a Paperclip-width sidebar with a few Raft color and asset cues, but it does not reproduce the information architecture, content density, contextual panels, or interaction hierarchy that make either reference coherent.

## Evidence

- `01-company-os.png`: current work and approval page.
- `04-company-os-office.png`: current office page.
- `02-raft.png`: Raft demo office.
- `03-paperclip.png`: Paperclip navigation and layout reference story.

## What was actually reused

- From Raft: orange accent, yellow demo banner, fish imagery, rounded controls.
- From Paperclip: approximately 240 px sidebar, compact top bar, grouped navigation labels.

## What was not reproduced

### Raft

- The office is the dominant operational surface, with a selected-agent dossier attached to it.
- Status, role, responsibility, permissions, goal, and action are visible in one scan.
- The scene, instruction banner, profile panel, and actions form one visual composition.
- Warm surfaces, tight radii, border weights, status pills, and orange actions are used as a system rather than isolated tokens.

### Paperclip

- Sidebar hierarchy begins with a primary action and search, then groups work, agents, and company controls.
- Counts and live state make navigation informative before the user clicks.
- The sidebar can collapse; icons remain aligned in both states.
- Breadcrumbs, page tabs, command discovery, and contextual detail panes reduce navigation cost.

## Highest-impact problems in the current UI

1. The page has redundant hierarchy: top-bar title, demo banner, eyebrow, page title, status pill, and card title compete before the user reaches an action.
2. Large generic white cards create dead space instead of grouping related decisions and evidence.
3. The work page separates task, event stream, and responsibility chain into distant blocks, so the user cannot read cause and effect in one scan.
4. The office page is a sparse room diagram with no attached contextual dossier; most of the viewport carries no operational meaning.
5. English system labels mixed with Chinese product copy make the interface feel assembled from unrelated prototypes.
6. The sidebar is structurally thin: no primary creation action, search, counts, live state, agent shortcuts, collapse behavior, or meaningful sub-navigation.
7. Raft styling was reduced to orange/yellow/fish cues. Paperclip styling was reduced to sidebar dimensions. This is token imitation, not product-pattern reuse.

## Accessibility risks visible in the screenshots

- Several secondary labels use small, low-contrast gray text.
- Information hierarchy depends heavily on faint borders and background tint differences.
- Current office agents have weak visible affordances and do not clearly communicate selection or keyboard focus.
- Large empty regions increase scanning distance and make related information harder to associate.

## Recommended direction

Use Paperclip for the global shell and information architecture, and Raft for the office workspace and operational detail composition. Do not hybridize at the token level. Rebuild one complete vertical slice first: grouped/collapsible sidebar → compact page header → office/task workspace → persistent contextual dossier → evidence/activity rail.
