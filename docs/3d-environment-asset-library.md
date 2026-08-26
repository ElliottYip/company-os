# 3D environment asset library

Status: active production goal started 2026-08-20

The environment library is a Company OS-owned, renderer-consumable collection,
not one monolithic office scene. `assets/3d/environment/asset-spec.json` is the
source specification for 79 independent architecture, furniture, technology,
pantry, decoration, restroom, and entry assets plus eight room assemblies.

## Contract mapping

The frozen `AssetManifest 1.0` remains the compatibility boundary. The richer
environment specification adds a renderer-side `role` and procedural `form`,
then projects every asset into the existing `ARCHITECTURE`, `FURNITURE`, or
`HANDHELD_PROP` kinds and the existing interaction slots. Core/application code
does not import Blender, GLB, materials, or renderer types.

One Blender unit equals one meter. Every exported asset must provide:

- stable kebab-case ID and human-readable fallback;
- positive width, depth, and height;
- at least one semantic interaction slot and anchor;
- a root anchor, collision bounds, and renderer-independent role;
- Company OS-owned source `.blend`, Web GLB, preview, hash, and byte size;
- warm clay materials with rounded silhouettes and no third-party branding.

## Room set

The eight required assemblies directly correspond to `OfficeModuleKind`:
entrance, reception, department, project room, meeting room, pantry, restroom,
and corridor. Rooms remain replaceable templates. The Office Compiler decides
which modules exist and how they connect; the renderer chooses a compatible 3D
assembly and never acquires organization or identity authority.

## Quality gates

- Minimum 50 independent props; current approved specification: 79.
- Exactly eight required room kinds, all populated with role-appropriate props.
- No paid generation without a separate user authorization.
- Blender generation is deterministic and restartable.
- Static catalog contact sheet plus full-office isometric preview.
- Manifest/hash/GLB guards, focused tests, typecheck, build, boundary and secret
  checks must pass before the goal is marked complete.
