# ADR 0014: One accountable human per team room

## Status

Accepted

## Date

2026-08-21

## Context

Generic transparent character sprites looked pasted onto the clay room because
their camera, light, chair contact, desk occlusion and shadows were not authored
as one scene. A fully replaceable avatar system would require seat-specific
poses, occlusion masks and many art variants despite the first release having no
movement or object interaction.

Company OS responsibility already requires every Agent to have an accountable
human. The office can make that relationship spatially legible instead of
placing an arbitrary mix of people into one room.

## Decision

- One accountable human owns one team room.
- A team room contains exactly one human and one to five of that human's
  assigned Agents.
- The first visual set has only two fixed human presentations: male and female.
- Humans do not have user-customizable hair, clothes or interchangeable sprite
  parts in this release.
- Agent fish are assigned by a deterministic visual rule and are not swapped by
  clicking the room.
- A department with multiple accountable humans compiles into an outer
  department region containing multiple team rooms.
- Meeting rooms, project rooms, reception, pantry and restroom are shared
  spaces outside an individual team-room ownership boundary.
- A fixed team-room composition is authored as one coherent image so character
  posture, furniture contact, occlusion, lighting and shadows remain natural.

## Compiler projection

```text
Company
└── Department region
    ├── Accountable human A team room
    │   ├── Human A
    │   └── Assigned Agents 0..N
    ├── Accountable human B team room
    │   ├── Human B
    │   └── Assigned Agents 0..N
    └── Department-level shared project rooms
```

The business relationship remains in the neutral `OfficeScene`; the Web
renderer chooses an admitted fixed room image for the human presentation and
Agent count. Missing image variants fail to a labelled structural fallback,
never to a falsely live Agent scene.

## Consequences

- The room visually reinforces accountable-human ownership.
- Multi-human departments scale by adding team rooms, not by crowding more
  people into one image.
- The number of required visual variants becomes bounded by human presentation
  and supported Agent-count templates.
- The first customer-facing renderer has no avatar marketplace, composited
  clothing, seat-specific sprite system, movement or realtime 3D requirement.
- ADR 0013's generic replaceable sprite-slot implementation is not the current
  release path; fixed room templates replace it.
