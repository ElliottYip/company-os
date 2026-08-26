# Company OS hybrid office rendering plan

> **Current release decision (2026-08-21):** ADR 0013 supersedes this plan as
> the implementation gate. The customer-facing office is currently static
> 2.5D: fixed camera, fixed workstation sockets, no movement and no realtime 3D
> runtime. This document is retained as evaluated future work, not as the
> current acceptance checklist.

## Desired experience

The office should feel alive before it feels technically impressive. A user
should immediately understand who is working, waiting, blocked, asking for
approval or finished. The renderer supports the product model; it does not own
or infer work state.

## Runtime layers

```text
DOM overlay         labels · approvals · evidence · accessible actions
Realtime 3D         focused people/fish · doors · chairs · held props
Sprite animation    steam · screens · ambient motion · distant idle states
Baked room bundle   clay shell · static furniture · decor · light/shadows
Interaction proxy   depth · wall mask · hit map · collision/socket volumes
```

## Interaction examples

| Experience | Visible representation | Runtime behavior |
| --- | --- | --- |
| Agent walks behind a desk | Baked desk + real-time character | Depth map occludes the character |
| User clicks a fixed cabinet | Baked cabinet | Object-ID hit map opens DOM details |
| Agent sits at a workstation | Baked room + 3D chair/character | Empty socket receives chair and rigged action |
| Agent picks up coffee | Baked counter + 3D cup/character | Cup attaches to hand anchor; steam is a sprite |
| Door opens | Baked wall with empty doorway + 3D door | Door rotates around hinge anchor |
| Blocking wall hides focus | Baked wall mask | Wall layer fades while collision remains |
| Mobile device zooms out | Baked room + sprite entities | Focused 3D entities downgrade to directional sprites |

## Asset triage rule

An item becomes real-time 3D only if at least one is true:

1. its geometry moves or changes;
2. a character attaches to or physically uses it;
3. it must pass in front of and behind other dynamic geometry;
4. the user directly rotates, moves or inspects it;
5. its state cannot be convincingly expressed by a sprite or overlay.

Otherwise it is baked into a room/view bundle or represented by a sprite.

## Revised production order

1. Freeze the four-view room-bundle format and semantic socket schema.
2. Produce one reception-room vertical slice with color, depth, wall and hit-map
   layers.
3. Use the existing fish assets as real-time 3D and verify depth occlusion.
4. Add one dynamic chair, one door and one handheld cup as the first interaction
   set.
5. Add sprite states for idle, working, waiting, blocked and approval-needed.
6. Measure transfer, memory, draw calls and frame time on desktop and mobile.
7. Only then classify the remaining asset inventory and produce the minimum
   necessary 3D masters.

## Immediate changes to the current 3D campaign

- Pause bulk generation of static furniture and decoration.
- Retain all paid outputs and provenance as candidates; do not delete them.
- Keep the three approved fish as canonical 3D assets.
- Keep accepted chairs as possible interaction assets.
- Treat reception desk, restroom shell, fixed counters and most decor as baked
  candidates unless an interaction later requires a 3D swap.
- Use the natural-language reception-desk experiment only as evidence; it is not
  admitted as a production Web asset.
- Resume paid generation only after an asset passes the interaction triage rule.

## Acceptance slice

The first hybrid slice passes when one compiled room can:

- switch among four fixed isometric directions;
- keep its clay visual composition intact;
- place a live fish or human at semantic sockets;
- occlude the entity behind a desk using the room depth layer;
- open one door and seat one entity on a 3D chair;
- show a status change and approval request without changing the room artwork;
- stay within the documented desktop and mobile performance budgets;
- fall back to a static accessible DOM view when WebGL is unavailable.
