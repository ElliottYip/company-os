# ADR 0004: Pre-3D Office Compiler and renderer port

Status: Accepted  
Date: 2026-08-18

## Decision

Organization structure compiles into renderer-neutral office modules and entity
states. `OfficeRendererPort` consumes a scene description; it does not own
organizational or responsibility logic. The initial Web adapter may use DOM and
2D assets behind this port.

Version 1.0 freezes three renderer-neutral contracts:

- `OfficeScene`: entrance, reception, department/project/meeting rooms, pantry,
  restroom, corridor topology, deterministic abstract-unit bounds, embodied
  occupants, semantic work state, workstation/door anchors, and action
  sequences.
- `AssetManifest`: logical asset kind, variants, unit scale, abstract bounds,
  semantic anchor points, interaction slots, and accessibility fallback.
- `ActionSequence`: actor, semantic movement/work/door/prop/approval/celebration
  actions, targets, and durations only.

`OfficeRendererPort.describe()` advertises supported contract versions and
whether an adapter is a structural preview or production renderer. This avoids
silently feeding a future renderer an incompatible scene.

No contract contains a runtime URL, mesh, material, skeleton, vendor session, or
renderer object. A production renderer resolves logical IDs behind the renderer
port. The DOM adapter labels itself as a structural preview so it cannot be
mistaken for the final office.

## Consequences

- Future renderers can replace 2D without rewriting business logic.
- Spatial rules and entity states are testable before asset production.
- Blender, GLB, Three.js, rigs, and 3D assets remain out of current scope.
