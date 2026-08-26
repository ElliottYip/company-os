# Office concept candidate V1 review

Status: `APPROVED_VISUAL_BASELINE`

Approved by the user on 2026-08-20. The user approved the overall room layout
and the furniture family. Implementation preserves the apparent irregular plan
through orthogonal room modules, variable footprints and offsets around a
shared corridor; it does not introduce arbitrary free-form room geometry into
the Office Compiler.

This document is a planning artifact. It does not promote the generated image,
the current procedural props, or any fixture to a final 3D asset. Formal asset
replacement starts only after visual approval.

## Bound reference

- Image: `outputs/company-os-office-concept-candidate-v1.png`
- SHA-256: `6ff431a56dd35c87b1627be02de852af330b7de85610deeed61f57e2f84199e7`
- Resolution: `1672 x 941`
- Role: overall layout, circulation, palette, density, and furniture-family
  reference for later room sheets and asset modeling
- Not authoritative for: exact dimensions, hidden elevations, topology, rigging,
  collisions, interaction semantics, or organization/identity data

## Spatial coverage

The candidate contains all eight required Office Compiler module kinds:

| Module kind | Candidate interpretation | Required follow-up sheet |
| --- | --- | --- |
| `ENTRANCE` | glazed entry, mat, low planting and foyer | entry facade, door and parcel niche elevations |
| `RECEPTION` | curved desk, waiting sofa and side table | desk front/back, waiting group and circulation clearance |
| `DEPARTMENT` | open workstation cluster with storage | one workstation bay plus repeatable 2/4/6-seat layouts |
| `PROJECT` | glass collaboration room with oval table | task wall, display wall and table/chair spacing |
| `MEETING` | formal long-table room | 6/8-seat variants and screen wall |
| `PANTRY` | fitted counter, appliances and cafe table | continuous counter elevation and appliance modules |
| `RESTROOM` | toilet, vanity and privacy partition | accessible clearances and separate fixture sheets |
| `CORRIDOR` | central circulation spine and bench | connection sockets, wall-fade groups and navigation anchors |

The overall arrangement is suitable as a visual direction candidate because the
rooms share one circulation spine and remain readable from a fixed-pitch
isometric camera. Exact room footprints still belong to the Office Compiler and
must not be inferred from image pixels.

## Current library disposition

The current approved specification contains 79 environment assets. It remains the
technical contract baseline, but its procedural geometry is not the visual
baseline.

### Preserve the contract; visually re-author selectively

- Keep stable asset IDs, meter-scale dimensions, semantic slots, anchors,
  collision bounds, hashes, and renderer mappings.
- Keep the approved fish assets and their existing identity-neutral renderer
  contract.
- Keep table and chair proportions as a starting point where they match the
  concept, but rebuild the office-chair base.
- Keep the eight room kinds and connection semantics; do not bake the candidate
  floor plan into core/application logic.

### Mandatory geometry corrections

1. `office-chair`: remove the incorrect four-leg plus caster combination. Use a
   central gas column, five-spoke base and five small recessed casters. No
   spherical wheels or visible balls.
2. `bookshelf`, `storage-cabinet`, `locker-bank`, `mail-cubby`,
   `pantry-counter`, and `snack-shelf`: re-author as one restrained fitted
   millwork family rather than unrelated block forms.
3. `coffee-machine`, `fridge`, `microwave`, `sink-unit`, `toilet`,
   `sink-basin`, and `restroom-stall`: re-author from approved room close-ups so
   silhouettes and installation heights are coherent.
4. `plant-tall`, `plant-desk`, and `planter-divider`: build a small shared plant
   kit with controlled leaf count and scale instead of repeated generic blobs.
5. All tabletop and wall-mounted props: validate support contact, wall offset,
   orientation, and collision before export so nothing floats or intersects.

### Excluded from the approved catalog

`ceiling-light-disc` and `ceiling-light-pendant` were removed before the asset
catalog became a stable release. They do not count toward the visual completion
claim and cannot appear in any room assembly. Lighting is daylight plus
concealed architectural light, not modeled hanging fixtures.

## Image-first production gates

1. Approve or revise the overall candidate image.
2. Generate one consistent close-up sheet for each of the eight module kinds.
3. Approve room sheets before geometry work starts.
4. Extract a canonical asset list; one capability has one visual owner and one
   stable asset ID.
5. Model the architecture kit and circulation sockets first.
6. Model repeated furniture families, then technology/appliances, then decor.
7. Produce individual Blender collections/source records, GLBs, previews,
   collisions, anchors, dimensions and hashes.
8. Recompose the full office and verify fixed pitch, horizontal orbit, wall
   fading, brightness, support contact and collision.

Generated concepts are references, not real Agents, production data, or final
assets. No paid generation or external vendor credential is required by this
review stage.
