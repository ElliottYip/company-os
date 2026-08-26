# ADR 0012: Progressive office detail loading

## Status

Accepted on 2026-08-21.

## Context

Company OS needs a warm, rotatable miniature office without making the control
plane slow. The complete lightweight office is 6.21 MB, while raw generated
assets are commonly 5–11 MB each. Loading every raw model in the overview would
consume hundreds of megabytes and couple visual richness to poor interaction.

The first optimized high-detail reception room is 3.01 MB. It is useful when a
person explicitly focuses that room, but unnecessary for the default dashboard.

## Decision

Use three progressive visual levels from the same renderer-neutral office scene:

1. The default 2.5D structural view has no Three.js or room-GLB request.
2. The opt-in rotatable company overview lazy-loads Three.js and the lightweight
   room modules only.
3. A focused room lazy-loads one separately budgeted detail-room GLB and replaces
   only that room's lightweight module. Returning to the overview restores the
   lightweight module without another network request.

Raw provider outputs are immutable production inputs, never runtime assets.
Every admitted derivative must be meter-normalized, preserve semantic anchors,
pass visual inspection, and satisfy automated byte budgets.

## Alternatives considered

### Load all high-detail rooms in the overview

Rejected because it transfers unnecessary geometry and textures, increases GPU
memory, and makes one failed asset affect the whole company view.

### Use only a static room image

Rejected as the final runtime because it cannot support camera rotation, wall
occlusion, semantic anchors, or later object interactions. It remains the
fastest default preview and accessibility fallback.

### Replace all lightweight assets immediately

Rejected because generated candidates have uneven topology and visual quality.
Selective admission preserves a known-good fallback and makes rollback a file
and manifest decision rather than a full scene rebuild.

## Consequences

- Initial JavaScript remains small; the 3D runtime is a separate dynamic chunk.
- Detail-room work proceeds one room at a time and is independently reversible.
- The runtime needs explicit overview/detail state and resource disposal.
- CI enforces initial bundle, lazy 3D chunk, room, and admitted-prop budgets.
- Future interactions attach to stable anchors, not provider mesh names.
