# ADR 0004: Pre-3D Office Compiler and renderer port

Status: Accepted  
Date: 2026-08-18

## Decision

Organization structure compiles into renderer-neutral office modules and entity
states. `OfficeRendererPort` consumes a scene description; it does not own
organizational or responsibility logic. The initial Web adapter may use DOM and
2D assets behind this port.

## Consequences

- Future renderers can replace 2D without rewriting business logic.
- Spatial rules and entity states are testable before asset production.
- Blender, GLB, Three.js, rigs, and 3D assets remain out of current scope.

