# ADR 0011: Hybrid 2.5D office rendering

## Status

Proposed

## Date

2026-08-20

## Context

Company OS needs a warm, living virtual office in which organization changes
compile into rooms and humans and Agents visibly work together. The experience
must support a fixed isometric pitch, horizontal view changes, wall fading,
selection, state animation, movement and object interaction. It must also load
acceptably on ordinary enterprise laptops and mobile clients.

The initial 3D-production experiment generated six environment models averaging
about 5 MB each and roughly 36,000–97,000 rendered triangles before Web
optimization. Loading every room shell, furniture item and decoration as a
real-time 3D model would make the first load, GPU memory, draw calls and mobile
fallback unnecessarily expensive. Most environment objects do not move, change
state or participate in an interaction.

Tencent Marvis publicly demonstrates a virtual office where Agents work, drink
coffee, play, move between desks and use shared spaces. Public material does not
document its renderer implementation, so Company OS does not assume that its
entire scene is real-time 3D. The useful product lesson is the visible life and
state communication, not a particular graphics stack.

## Decision

Use a hybrid 2.5D renderer. `OfficeScene`, `AssetManifest` and
`ActionSequence` remain renderer-neutral. The renderer chooses one of four
representations for each visual asset:

1. `BAKED_LAYER` — room shells, built-ins, static furniture clusters, decor,
   ambient light and contact shadows rendered as view-specific AVIF/WebP layers.
2. `SPRITE_SEQUENCE` — lightweight state or ambient animation with four or
   eight view directions, such as steam, screen activity, plants, distant idle
   characters and non-interactive effects.
3. `REALTIME_3D` — objects whose geometry must move, rotate, animate, occlude
   correctly or attach to another entity: focused humans and fish, doors,
   movable chairs, handheld props and selected interactive equipment.
4. `DOM_OVERLAY` — labels, work state, approvals, evidence indicators, focus
   rings and accessible controls.

Each asset keeps one stable semantic asset ID regardless of representation.
Representation is renderer metadata and never changes responsibility, identity,
approval or work semantics.

### Room composition

The Office Compiler selects a room template and semantic sockets. A room bundle
contains:

- four snapped isometric views at yaw 45, 135, 225 and 315 degrees;
- a color layer;
- a depth layer for correct character/furniture occlusion;
- a wall mask for selective fade;
- an object-ID hit map for static-object selection;
- empty sockets for dynamic objects;
- small invisible collision and interaction proxies;
- optional sprite sequences for ambient motion.

The camera keeps its existing fixed 42-degree pitch and snaps between the four
supported yaw angles. A short cross-fade and object motion bridge the snap; the
renderer does not pretend that a baked room supports arbitrary continuous yaw.
An eight-view bundle may be used later for hero rooms without changing the
contract.

### What remains real-time 3D

- the three approved fish and focused human characters;
- character rigs and action/attachment points;
- doors while opening or closing;
- chairs while a character sits, turns or moves them;
- cups, phones, documents and other props while picked up or used;
- approval beacons and equipment whose physical state changes;
- a small number of focus-mode hero objects.

The same item may use a baked representation at room scale and swap to a 3D
representation only when focused or participating in an action. The swap uses
the same asset ID, transform and semantic anchors.

### What is normally baked or sprite-based

- floor, static walls, windows and columns;
- reception shell, fixed counters, cabinets and fixed desks;
- toilets, sinks, partitions and fixed appliances;
- rugs, wall art, books, plants and background clutter;
- ambient light, contact shadows, screen glow, steam and status effects;
- distant or unfocused entities when mobile performance requires it.

### Performance budgets

The production gate targets the following, measured on a mid-range enterprise
laptop and a representative mobile device:

| Budget | Desktop | Mobile |
| --- | ---: | ---: |
| Initial office transfer | <= 12 MB | <= 7 MB |
| Visible real-time triangles | <= 250,000 | <= 120,000 |
| Draw calls | <= 100 | <= 60 |
| Simultaneously animated rigs | <= 12 | <= 6 |
| GPU texture memory for current room | <= 128 MB | <= 64 MB |
| Current + adjacent room bundles | lazy loaded | lazy loaded |

Repeated 3D objects use instancing. Web meshes use LODs and Meshopt/Draco;
textures use KTX2/Basis. The Blender/high-quality generation model is an offline
master, never the direct Web payload.

## Asset manifest extension

The future manifest version should add renderer-owned metadata equivalent to:

```ts
type VisualRepresentation =
  | { mode: "BAKED_LAYER"; views: ViewBundle; depth: string; hitMap: string }
  | { mode: "SPRITE_SEQUENCE"; views: ViewSequenceBundle }
  | { mode: "REALTIME_3D"; lods: readonly LodAsset[]; anchors: readonly Anchor[] }
  | { mode: "DOM_OVERLAY"; overlayKind: string };
```

Collision, interaction and attachment anchors remain semantic contracts and are
available even when the visible object is baked. A baked object may therefore
still be clickable and may reserve space without loading a visible 3D mesh.

## Alternatives considered

### Full real-time 3D office

Rejected as the default. It offers arbitrary camera movement but spends network,
GPU and asset-production budget on objects whose geometry never changes. It
also makes mobile quality and deterministic art direction harder.

### One flat office image with DOM hotspots

Rejected. It is light but cannot provide convincing entity occlusion, room
reconfiguration, held-object actions, wall fading or focused interactions.

### Pre-rendered video loops

Rejected as the primary runtime. They look polished but cannot project live
Agent state or react deterministically to Office Compiler output. Short loops
remain valid as optional sprite sequences.

## Consequences

- Company OS can preserve the approved clay miniature art direction without
  requiring every prop to be a production-ready GLB.
- The expensive 3D pipeline is reserved for characters and interaction-critical
  objects.
- Static scenes remain selectable and correctly occlude dynamic characters via
  depth and object-ID maps.
- Arbitrary free camera orbit is intentionally traded for four stable isometric
  directions and predictable performance.
- Room templates and view bundles become first-class owned assets and require
  deterministic generation and hash validation.
- The current full-3D renderer remains a diagnostic adapter, not the only
  production rendering path.

## Source notes

- Tencent Marvis official entry: <https://marvis.qq.com/>
- Public virtual-office behavior report:
  <https://finance.sina.cn/2026-05-26/detail-inhzevat2344134.d.html>
- Public product experience report:
  <https://www.chooseai.net/news/4610/>

These sources support product behavior only. They do not disclose Marvis source
code or prove a specific renderer implementation.
