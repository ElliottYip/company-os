# ADR 0013: Static 2.5D office for the first customer-facing release

## Status

Superseded by ADR 0014

## Date

2026-08-21

## Context

The earlier hybrid renderer research kept movement, realtime 3D characters,
depth layers and object interaction available as a future direction. The first
working prototypes showed that those capabilities substantially increase asset
production, alignment and runtime complexity before they improve the Company
OS control-plane experience. Repeated whole-room image edits also degraded the
approved miniature-clay artwork.

The current product decision is simpler: no character movement, no walk cycle,
no pathfinding and no customer-facing realtime 3D office. Rooms use one fixed
semi-top-down view and regular workstation layouts. Work state is expressed by
static character sprites and accessible DOM status overlays.

## Decision

The first release uses a static 2.5D room composer:

- each room is an immutable, sharp background image;
- every work-capable room declares fixed percentage-based sprite slots;
- a slot declares its facing, scale and visual depth;
- a preset fills each slot with a human, an Agent or an explicit empty value;
- changing team composition replaces sprite layers only;
- changing work state replaces labels and status treatment only;
- Agent images can be changed without changing position or facing;
- pantry and restroom scenes contain no person or Agent overlays;
- the 3D renderer and generated GLBs remain retained experiments, not the
  default product path.

The default vertical slice is a three-seat room containing one accountable
human and two explicitly labelled Demo Agent sprites. It never represents a
fixture as a live Agent.

## Loading policy

Only the selected room image is assigned to the visible `<img>`. Room masters
remain under `outputs/`; Web-owned copies are resized to 1000 pixels wide.
Character sprites are independently cached and reused across rooms. The
renderer has no Three.js dependency and does not load a GLB.

## Consequences

- The room keeps the approved visual quality because runtime composition never
  repaints its pixels.
- Fixed slots make different human/Agent ratios deterministic and inexpensive.
- Front-left and front-right assets can be mirrored for the two workstation
  directions; additional direction-specific art can be added without changing
  the room contract.
- There is no promise of free camera rotation, wall fading, collision,
  pathfinding or physical object interaction in this release.
- ADR 0011 remains the record of the richer hybrid option. Its interactive
  acceptance slice is postponed and does not define the current release gate.
