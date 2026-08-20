# Direction B Pre-3D readiness

Status: complete on 2026-08-20; stopped at the 3D asset-production gate.

## Verified in the current execution

- First-class WorkAttempt state, frozen authority, fencing leases, approval
  pause/resume, cancellation/timeout, and evidence-backed `OUTCOME_UNKNOWN`
  reconciliation.
- Atomic event/outbox commit, monotonic projection checkpoints, and rollback-safe
  import of the earlier self-hosted event files.
- Formal tenant-gated Agent Boss read projection and stable structured API
  errors; deterministic Demo remains isolated.
- Secret-free short lease proofs with access intent audited before issuance.
- Versioned Connector, model-route, and data-authorization catalogs under
  formal identity and revision control.
- Trusted/versioned FDE templates with cross-domain validation, dry-run, atomic
  application event, and precise rollback event.
- Formal Web read client plus real-browser Demo responsibility loop at desktop
  and 390 × 844, with a clean console.
- Frozen renderer-neutral `OfficeScene 1.0`, `AssetManifest 1.0`, and
  `ActionSequence 1.0`, including abstract coordinates, bounds, anchors,
  semantic actions, and renderer capability negotiation.

## Closed gate evidence

1. Formal work and exact-approval commands are tenant-bound HTTP contracts; the
   formal Web has server-derived input plus loading, unauthorized, forbidden,
   offline, empty, and failure states.
2. Every WorkAttempt transition is replayable from the durable event ledger;
   Connector commands commit atomically through a secret-free outbox.
3. Both deployment profiles admit only the operational durable-store contract
   and pass the same commit, outbox, backup, restore, and rollback-target smoke.
4. Trusted FDE applications and rollbacks replay after restart into one
   Company OS-owned organization/responsibility/Connector/governance projection.
5. Formal Connector/model/data/egress administration is sanitized; every export
   allow or deny decision is persisted without content, credentials, or session.
6. Renderer conformance covers every entity state and semantic interaction slot
   while the DOM adapter remains explicitly a structural preview.
7. `npm run verify` passes 101 focused tests, all guards/scans/type/build gates,
   and five real-browser cases at 320, 768, 1024, and 1440 px with no console
   errors or warnings.

The next product task may prepare formal 3D characters, rooms, props, rigs, and
animation assets against the frozen contracts. It must remain a separate goal;
this repository currently contains no Blender, GLB, Three.js, mesh, rig, or 3D
asset-production implementation.
