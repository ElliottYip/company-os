# Pre-3D visual baseline

Status: Accepted with one pending source recheck  
Audit date: 2026-08-18

This baseline governs information architecture, spatial compilation, and asset
contracts before 3D production. It does not ask the DOM renderer to imitate a
finished 3D office.

## What was visually inspected

- `coral-labs-office-empty-v1.png`: a bright isometric miniature office with a
  coherent floor plate, enclosing walls, openable doors, entrance, reception,
  meeting room, working rooms, kitchen/break area, toilets, circulation, real
  desks/chairs/storage/plants, and people seated at usable furniture. Warm wood,
  off-white surfaces, muted green plants, soft shadows, and restrained color make
  it feel inhabited without becoming noisy.
- Fizz, Bumble, and Honey: three transparent PNG characters with visibly hand-
  worked clay texture, a compact whole-body silhouette, shared fins/gill marks,
  strong yellow/blue/orange identity, and deliberately simple, expressive facial
  differences. Their family resemblance matters more than generic polish.
- Rejected generated human portrait `exec-cdc5cfdf-...png`: a polished bust with
  oversized commercial-cartoon eyes, smooth hair, blazer, and no full body or
  interaction affordances. It reads as a generic profile avatar, not a miniature
  office coworker, and is prohibited as a target style.
- Raft UI references `RaftFishAvatar.tsx`, `FishAvatarPicker.tsx`, and
  `ClayAvatarPicker.tsx`: audited only. React/Tailwind dependencies and UI code
  were not copied. The existing CSS-shape person is a temporary idea, not an asset
  direction.
- Paperclip UI layout references at audit pin `v2026.817.0` / commit
  `213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`: `ui/src/components/Layout.tsx`,
  `Sidebar.tsx`, `SidebarShell.tsx`, `BreadcrumbBar.tsx`, `PropertiesPanel.tsx`,
  `MetricCard.tsx`, and `ui/src/pages/Dashboard.tsx`. They establish the
  workspace layout reference only; Paperclip React/Tailwind code and product
  models are not copied into Company OS.

## Product-space intent

Outside the 3D office itself, Company OS combines two explicit sources without
mixing their product domains. Paperclip governs functional arrangement: company
context, quick actions, grouped navigation, breadcrumbs, command discovery,
contextual detail panes, and a five-slot mobile bottom bar. Buzz/Raft governs
visual execution: the pale grey-green rail, continuous white workspace, compact
type, restrained borders and radii, semantic status pills, and activity-led
content density. Neither product is a runtime dependency.

The office remains Company OS-owned. Company, departments, humans, agents,
reporting/accountability, projects, and workspaces are source data. The compiler
must produce department rooms, cross-department project rooms, meeting rooms,
reception, break area, toilets, entrance, and connected corridors. Adding or
removing structure must deterministically alter the space.

Humans and fish are embodied occupants. They occupy rooms, seats, doors, and
common areas and later perform reusable interactions; they are not floating
avatars pinned over cards. Work states such as working, waiting, blocked,
approval-needed, and complete must be legible in both accessible UI and spatial
state.

## Product typography system

The customer Web uses one semantic type scale owned by `web/family-ui.css`:

| Role | Token | Default |
|---|---|---:|
| Product display | `--type-display` | responsive 36–62 px |
| Page title | `--type-page-title` | 18 px |
| Section title | `--type-section-title` | 14 px |
| Body | `--type-body` | 13 px |
| Controls | `--type-control` | 13 px |
| Supporting copy | `--type-supporting` | 12 px |
| Labels and metadata | `--type-label` | 11 px |
| Metrics | `--type-metric` | 24 px |

Ten-pixel microcopy is reserved for keyboard hints and compact renderer
annotations. Primary product content must not use 8–10 px local values. Page,
section, body, and supporting copy use shared title/body/compact line-height
tokens so Chinese and English keep the same vertical rhythm.

## Required visual qualities

- Bright, warm, calm, tactile, and operational.
- One clay-miniature material family across office, humans, fish, and props.
- Clear rooms, thresholds, circulation, furniture purpose, and occupant scale.
- Paperclip-like workspace hierarchy and information density, combined with
  repository-owned Raft-family control primitives.
- Character diversity through silhouette, body, hair, clothing, mobility aids,
  and accessories—not skin-tone swaps on one generic bust.
- Every visual state has a semantic text equivalent; color or animation alone is
  never the only carrier.

## Prohibited directions

- Generic AI/SaaS dashboard grids presented as the product experience.
- Cheap CSS boxes or gradients marketed as the final office.
- Generic commercial 3D-cartoon bust portraits or disconnected profile heads.
- Floating people/fish without occupancy, furniture, navigation, or scale rules.
- Baking business logic into a particular image, renderer, rig, or file format.
- Blender, GLB, Three.js, rigging, animation production, or new 3D assets before
  the Pre-3D exit gate is accepted.

## Pre-3D renderer rule

The current 2D renderer is a diagnostic projection. It may show room topology,
occupancy, and states, but must label itself as a Pre-3D structural preview and
must not visually promise production 3D quality. The compiler and asset manifest
must remain renderer-neutral.

## Pending source recheck

The concept image was requested at
`/Users/elliottye/Desktop/exec-7e0f5b06-5518-4639-94b0-126d28cb7610.png`,
but that file was absent during the audit. The structural intent above comes from
the user's authoritative written handoff. Once the image is reattached or restored,
the visual observations must be checked against it; this does not block neutral
compiler work.
