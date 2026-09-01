# Generator source audit and Company OS visual direction proposal

Date: 2026-08-31  
Status: proposal only; no Company OS product behavior or presentation has been changed from this document  
Reference repository: `/Users/elliottye/Gnerator`

## Purpose and boundary

This audit reads Generator's visual contract and source implementation directly. It supersedes conclusions inferred only from the public landing page, but it does not supersede the currently implemented Company OS UI contract until the direction is approved.

The proposed transfer is visual and interaction-level only. It must not change Company OS product semantics, information architecture, responsibility ownership, approval authority, evidence admission, Demo/formal separation, Runtime, credentials, production data, networking or deployment behavior.

## Authoritative Generator sources

| Source | Evidence used |
| --- | --- |
| `DESIGN.md` | Declares the warm, compact studio direction, palette, type roles, spacing, radii, component patterns and explicit anti-patterns. |
| `AGENTS.md` | Makes `DESIGN.md` the baseline and names the studio components as the implementation source of truth. |
| `src/app/globals.css` | Owns the inherited font stack, smoothing, focus ring, base canvas and legacy theme values. |
| `src/components/app-shell/app-frame.tsx` | Uses a 1440px maximum work area, compact responsive gutters and a full-height studio frame. |
| `src/components/root/app-sidebar-shell.tsx` | Implements a 92px icon rail, 11px labels, 17px icons, quiet active surfaces and a mobile dock. |
| `src/components/home/studio-ui.tsx` | Implements the reusable label, control pill, selector, preference panel, upload tile, floating action and recent-task patterns. |
| `src/components/home/template-studio.tsx` | Demonstrates a focus-first generation workspace with recent work, compact controls, bounded preference panels and media preview. |
| `src/components/home/video-composer.tsx` | Reuses the same hierarchy and parameter primitives for a materially different workflow. |
| `src/components/tools/image-compressor.tsx` | Confirms that the upload, action and floating-preview language extends beyond the main generators. |
| `src/components/ui/button-1.tsx` | Resolves the button-shape source of truth: the shipped component defaults to square actions with 6px medium radius; the older `DESIGN.md` pill wording is stale for current actions. |
| `src/components/account/account-hub.tsx` | Shows a known area of drift: 4px radii and larger inputs do not fully match the declared core studio language. It is not treated as the primary reference. |

## What Generator's visual system actually does

### 1. It creates hierarchy through role separation, not many arbitrary sizes

Declared roles are 40px hero, 18px section title, 15px panel title, 13px body/control, 12px quiet label and 11px metadata. Declared weights are 400, 500 and 600. The system uses contrast and grouping before adding size.

The reusable studio implementation is close to that contract:

- `SectionLabel`: 12.5px / 500 / blue-gray.
- `ControlPill`: 11px / 500 / 26px high / 8px radius.
- preference panel title: 15px / 600.
- floating selector trigger: 12–13px.
- recent task metadata: 11–12px; prompt/body: 13px.

### 2. It separates global navigation from the working canvas

The 92px rail is visually quiet and consistent. The main workspace receives nearly all available width, is capped at 1440px, and uses compact 12–24px gutters. The rail is not a competing information panel.

Company OS cannot copy the 92px rail directly because its grouped governance destinations need persistent text labels. The transferable rule is the quiet shell and dominant working canvas, not the exact width.

### 3. It gives every screen a working subject

Generator's core pages revolve around a prompt, preview, uploaded object, recent result or active parameter set. Supporting controls remain visually subordinate. Empty space surrounds the subject instead of appearing after a short strip of content.

For Company OS, the corresponding subjects are:

- Dashboard: the current situation requiring attention.
- Agents: an Agent identity and its current operating state.
- Work: active work and stage progression.
- Approvals: the decision target and its evidence.
- Governance: the responsibility and boundary relationship.
- Usage: current usage trajectory and budget exposure.

### 4. It uses a restrained surface vocabulary

The declared palette is white plus warm white (`#f6f5f4`, `#fbfaf8`), near-black ink, soft gray-blue borders and one selective accent. Borders do most structural work. Shadows are reserved for cards that need separation and floating surfaces.

Radii have explicit roles: 4px micro/tag, 6–8px action/control, 12–16px local panel and 22px large upload/focal container. Current primary/secondary actions are square-rounded. Company OS further sharpens textual status and counter badges to 4px so actions and labels share one coherent geometry.

### 5. It treats secondary controls as nearby context

Preference panels are bounded floating surfaces close to their trigger. Small choices use popovers or segmented pills. Rich media preview uses a dedicated overlay. Larger creation flows use a centered Radix dialog with a bounded white container and internal scrolling.

The useful transfer is surface selection by task size and context. Company OS should not copy Generator's media-preview overlay or its 24px preference-panel radius into every governance flow.

## Current Company OS mismatch against this source

| ID | Severity | Mismatch | Consequence |
| --- | --- | --- | --- |
| GEN-001 | P1 | Page title is 18px while most content spans 10–14px. | The hierarchy compresses into one visual band; the right pane looks typographically unrelated to the calmer rail. |
| GEN-002 | P1 | Ordinary content uses 450/550/650 weights. | These nonstandard intermediate weights can be synthesized differently across Inter and Chinese system fonts. |
| GEN-003 | P1 | Dashboard and approval pages end after a shallow top strip. | Empty space has no focal subject and reads as unfinished rather than calm. |
| GEN-004 | P1 | Agent rows lead with boundary enums and runtime fields. | Technical governance data competes with identity, health and current work. |
| GEN-005 | P1 | Cards, strips, lists and panels use nearly the same white/border treatment. | Every region has the same visual volume; no page has a dominant work surface. |
| GEN-006 | P2 | The existing radius contract is uniformly compact. | It is consistent, but it cannot distinguish controls, ordinary panels, focal workspaces and overlays. |
| GEN-007 | P2 | Page families solve density independently. | Dashboard, Agents, Work, Governance and Usage do not share one composition rhythm even when tokens match. |
| GEN-008 | P2 | Overlay geometry is technically correct but visually generic. | Creation and detail flows feel detached from the object and page hierarchy that opened them. |

## Proposed Company OS visual contract v2

This is an adaptation of Generator's declared system, not a literal clone.

### Typography

| Role | Proposed value | Company OS use |
| --- | --- | --- |
| Product display | 40px / 600 | Public front door only. |
| Page title | 24px / 600 | One per app page; replaces the current 18px title. |
| Detail title | 20px / 600 | Agent, work, approval and evidence primary object. |
| Section title | 18px / 600 | Major workspace regions. |
| Panel title | 15px / 600 | Local cards, drawers and modal groups. |
| Body | 14px / 400 | Chinese-heavy readable product content and record names. |
| Control | 13px / 500 | Navigation, buttons, tabs and form controls. |
| Supporting | 12px / 400 | Descriptions and secondary values. |
| Metadata | 11px / 400 or 500 | Timestamps, taxonomy and non-decision annotations only. |
| Metric | 28–32px / 600 | High-value situation and usage numbers. |

Use only 400, 500 and 600. Shell and content inherit one locale-aware stack. English remains Inter-first; Chinese remains PingFang-first to avoid mixed-script optical switching while preserving Generator's role scale.

### Surface and shape

- canvas: white.
- quiet shell/alternate region: `#f6f5f4`.
- raised work surface: `#fbfaf8` or white depending on neighboring contrast.
- default border: Generator-like soft gray-blue, adjusted only when current contrast tests require it.
- action button radius: 6px, matching Generator's current default square button.
- form/compact control radius: 8px.
- ordinary panel radius: 12px.
- focal workspace radius: 16px.
- overlay radius: 16px.
- status/counter badge radius: 4px; full circles are reserved for literal dot indicators.
- ordinary panels remain border-led; shadow is reserved for focus cards and overlays.

### Layout

- Keep a text-labelled Company OS rail, but reduce its visual authority and give the work lane more width.
- Use 24px desktop and 20px tablet gutters, with a 1440px maximum working area where useful.
- Each page must name one focal subject and fill the first viewport with useful context around it.
- Avoid decorative hero bands inside the product and avoid short content strips followed by unexplained blank space.
- Prefer one dominant work surface plus one supporting rail/column over grids of equal cards.

## Secondary-interaction adaptation

| Flow | Surface | Direction |
| --- | --- | --- |
| Agent/work/evidence contextual inspection | Right drawer | Preserve list context; establish object identity in a stronger 20px header and group technical metadata below. |
| Add/edit Agent or task | Centered modal | 600–640px desktop, viewport centered, compact 13px controls, 15px group titles, internal scrolling with persistent close/actions. |
| Approval/rejection | Dedicated review page | The decision target is the page subject; evidence and policy stay visible, with a stable decision footer. |
| Evidence inside approval | Right drawer | Preserve the review page and return focus to the exact evidence trigger. |
| Small filter/row action | Anchored popover | Compact, trigger-adjacent, 8–12px radius and no oversized blank interior. |
| Dangerous confirmation | Small modal | 420–460px, explicit immutable object/action context and danger action. |
| Token renewal | Bounded workflow modal | 560–600px with validation and result states in one context. |

The existing Company OS focus, Escape, backdrop, busy-state and focus-return contract remains authoritative. Generator informs visual containment, not security semantics.

## Page migration target

1. Dashboard becomes a situation workspace: one attention/current-work focal panel, compact metrics and an activity/supporting column.
2. Agents becomes object-first: identity, role, health and current work lead; runtime, visibility and privacy boundaries move into a secondary grid or drawer.
3. Work gains stage progression and a selected-work focal surface instead of equal flat records.
4. Approvals uses a full decision composition with evidence and impact, not a sparse card at the top.
5. Governance shows relationships and responsibility boundaries as the subject; cards become supporting explanations.
6. Usage & Billing uses trend, budget progress and renewal status as the subject; raw totals become supporting metrics.
7. Public front door may use Generator's larger display rhythm and selective brand atmosphere, while keeping Company OS copy and Demo/formal boundary language.

## Implementation gate

No production CSS or component migration should begin until this direction is approved. After approval, implementation begins with the shared token layer and three vertical slices—Dashboard, Agents and Approval Review—before any full-site migration.

Acceptance must include side-by-side browser evidence at 1440x900 and 1024x768 in Chinese and English, keyboard/focus checks for the representative secondary flows, then `npm run typecheck`, `npm run build`, `npm test`, `npm run check:boundaries` and final `npm run verify`.
