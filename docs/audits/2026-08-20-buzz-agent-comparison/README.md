# Company OS vs Buzz/Raft Agent UI

> Superseded. Thread `019fef5f-8fdb-71a1-9b8e-b57612de319b` identifies the
> Buzz/Raft project context as a whole; it does not identify `/agents` as the
> visual reference surface. The `/agents`-specific comparison below should not
> be used as the redesign target.

Viewport: 1440 × 900. Captured locally on 2026-08-20.

## Corrected target

“Raft” refers to the Buzz project’s `/agents` route and `AgentBossPage`, not the
separate `/demo/office` Company OS demonstration.

## Evidence

- `01-buzz-raft-agent.png`: live Buzz/Raft `/agents` page. The local instance is
  in its real unconfigured-company empty state.
- `02-current-company-os.png`: current Company OS office page.
- `03-current-work.png`: current Company OS work and approval page.
- Populated Agent Boss structure was verified from Buzz source at
  `web/src/features/company-os/ui/AgentBossPage.tsx` because the local instance
  has no published company data.

## Verdict

The current Company OS has not faithfully reused the Buzz/Raft Agent UI. It
copies a few surface tokens — a 240 px sidebar, orange CTA, pale active state,
thin borders, and a small top bar — but not the Agent product’s page grammar or
component composition.

## Buzz/Raft Agent grammar

- Stable 240 px navigation rail with a 64 px brand header.
- Dense product navigation: office, company, models/data, Agent access, work,
  decisions, projects, agents, skills, knowledge, automation, responsibility,
  certification, settings, and repositories.
- Pale warm active row and orange primary action.
- Empty state is centered, narrow, and decisive: icon, one title, one sentence,
  one CTA.
- Populated Agent Boss uses a constrained page header, two 44 px actions, a
  four-cell metric strip, and a responsive two/three-column Agent card grid.
- Agent cards use square thin borders, compact metadata, status pills, and
  inline attention notices. Related information stays inside one card.

## Current Company OS divergence

1. The sidebar contains only four destinations, uses a gray active row, and
   replaces product navigation with a large inert footer status block.
2. The 48 px top bar, yellow demo strip, page title, status pill, and content
   title create redundant hierarchy that Buzz/Raft does not have.
3. Current content is composed as large rounded containers with generous empty
   regions. Buzz/Raft uses compact metric cells and card grids.
4. Task, event stream, responsibility, and evidence are split across distant
   panels instead of being grouped around an Agent or work item.
5. The current office diagram is a separate visual language; it does not inherit
   Buzz/Raft Agent cards, metadata rows, attention notices, or action grouping.
6. English prototype labels such as `AGENT BOSS WORKBENCH`, `ACTIVE WORK`, and
   `PRE-3D STRUCTURAL PREVIEW` are not part of the Buzz/Raft Agent UI grammar.

## Evidence limit

The live Buzz/Raft instance had no configured company, so the screenshot shows
the real empty state. Claims about the populated metric strip and Agent cards
come from the pinned local Buzz source, not from a populated screenshot.
