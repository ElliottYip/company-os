# Direction B Pre-3D readiness

Status: active; not yet at the 3D production gate.

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

## Remaining before the gate can close

1. Add formal command HTTP contracts for work assignment and exact approval;
   wire them into the formal Web with input, loading, unauthorized, offline,
   empty, and failure states. The current formal Web is intentionally read-only.
2. Persist and project WorkAttempt transitions through the durable store/outbox
   rather than only defining the pure state machine.
3. Enforce the durable control-plane store contract for managed-cloud admission,
   and add deployment smoke/backup/rollback verification for both profiles.
4. Project applied/rolled-back FDE packages into the four canonical catalogs and
   test restart/replay behavior.
5. Add model/data/Connector administration projections to the formal API and
   Web, plus persisted data-egress decision audit.
6. Add renderer conformance around every scene state and semantic asset slot;
   keep the DOM output explicitly structural and do not improve it by faking a
   final 3D office.
7. Reconcile the historical checklist in `docs/pre-3d-program.md`, run the final
   complete verification matrix, and publish the deployment/migration handoff.

No formal 3D character, room, prop, rig, animation, GLB, or Three.js work is
authorized until these items are complete.
