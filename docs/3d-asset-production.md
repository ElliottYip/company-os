# 3D asset production

Status: first production batch in progress on 2026-08-20

This phase starts after the accepted Pre-3D gate. It preserves `OfficeScene 1.0`,
`AssetManifest 1.0`, and `ActionSequence 1.0`; generated files are renderer
inputs and never become business-authoritative records.

## Batch 1: canonical fish

The first batch converts the three approved, provenance-recorded Raft clay-fish
PNGs into complete 3D candidates. The purpose is to validate shape fidelity,
topology, material response, scale, orientation, rig seams, and Web delivery
before producing humans, rooms, or a large prop catalog.

- Provider: Hyper3D Rodin API, Gen-2.5 Medium.
- Output: quad-mesh PBR GLB plus provider preview when available.
- Expected API cost: 0.5 credits per fish, 1.5 credits total.
- Credential: supplied out of band and loaded only into the process environment;
  never stored in this repository or generation metadata.
- Source ownership and hashes: `docs/source-manifest.md` and each generated
  asset's `generation.json`.
- Provider output terms and retention were checked on 2026-08-20. Rodin output
  may be used commercially subject to the terms and third-party rights; API
  payloads and generated output are retained in active systems for seven days
  and are not used for training under the then-current API policy.

### Bumble acceptance record

`fish-bumble-3d-v4` was visually accepted by the user on 2026-08-20 as the
canonical Bumble base mesh. Its admission evidence is under
`assets/3d/generated/fish-bumble-3d-v4/qa/`.

- Both sides contain exactly three separate, raised gill bars.
- Bars are parallel, evenly spaced, and do not overlap or enter the body.
- The front silhouette has no ring-like gill extrusion.
- Both eyes are free of the unintended white protrusion seen in an earlier
  Fizz candidate.
- Source order intentionally uses the approved left and right profiles before
  the front view. Rear and top views were excluded because they caused gill
  topology conflicts in earlier Bumble candidates.
- Provider cost for this accepted generation: 0.5 credits.

Rejected Bumble v2/v3 candidates and local repair experiments remain QA
evidence only and must not be published as runtime assets.

### Canonical batch acceptance

The user accepted the full canonical batch on 2026-08-20:

| Character | Accepted source mesh | Web GLB | Production state |
|---|---|---|---|
| Bumble | `fish-bumble-3d-v4` | `web/public/assets/3d/fish-bumble-3d-v4.glb` | Rigid-body rigged candidate |
| Fizz | `fish-fizz-3d-v3` | `web/public/assets/3d/fish-fizz-3d-v3.glb` | Rigid-body rigged candidate |
| Honey | `fish-honey-3d-v2` | `web/public/assets/3d/fish-honey-3d-v2.glb` | Rigid-body rigged candidate |

All three have normalized `-X` forward and `+Z` up axes, one skin, the four
contract actions, and nine interaction anchors. The current action set is an
honest whole-character rigid animation layer. Fin, tail, dorsal, and gaze bones
are stable future seams but are intentionally unweighted until manual skinning
or safe part separation is completed.

`npm run check:3d-assets` verifies the manifest, exact hashes and byte sizes,
GLB 2.0 header, mesh/skin count, action set, and interaction anchors.

## Admission sequence

1. Generate deterministic candidates from the approved PNG and fixed seed.
2. Inspect GLB structure, texture embedding, dimensions, materials, and bounds.
3. Normalize axis, scale, origin, and naming in a Company OS-owned Blender file.
4. Produce a turntable and clay/material preview for visual review.
5. Establish fish rig and interaction anchors (`root`, `gaze`, `hand/fin`,
   workstation, door, handheld prop).
6. Export a Web GLB and validate it against `AssetManifest 1.0`.
7. Only after the three fish pass, admit modular office architecture and props.

Provider-generated candidates are not automatically production-approved. A
candidate that is visually inaccurate, unriggable, unnecessarily heavy, or
contains unexpected geometry is rejected or reworked in Blender.
