# Company OS Pre-3D delivery program

Status: Active  
Canonical repository: `/Users/elliottye/Documents/ChatGPT/os`  
Imported baseline: `f904a66`

## Outcome

Reach a production-shaped, locally verifiable Company OS immediately before 3D
asset production. Completion requires a real application pipeline for Demo and
formal modes, durable responsibility records, secure identity/approval/data
boundaries, provider-neutral connector conformance, an Agent Boss Web product,
two runnable deployment compositions, and frozen renderer-neutral office/asset/
action contracts.

No Blender, GLB, Three.js, rig, mesh, texture, animation, or actual 3D asset is
in scope.

## Binary exit criteria

1. `npm run verify` passes unit, integration, boundary, security, type, build,
   deployment-smoke, and browser E2E gates with zero skipped tests.
2. Demo completes assign → plan → activity → approval → evidence/result →
   responsibility → reset through the same application services used by formal
   mode, with a test proving zero external side effects.
3. Company, department, project, workspace, human, agent, role, goal, work,
   permission, risk, evidence, approval, result, and responsibility records are
   durable through a replaceable store adapter.
4. Every protected formal-mode operation authenticates an organization-scoped
   identity and authorizes the exact action/resource; Demo cannot enter formal
   state or reuse formal identity/permission records.
5. The connector conformance suite validates two independent reference
   implementations against capability, health, submit/progress, pause/resume,
   cancellation, timeout, idempotency, evidence/result, and secret-free runtime
   proof semantics.
6. Model routing uses credential references only; data access is contract-bound;
   exports default-deny and produce an audit decision.
7. `managed-cloud` and `self-hosted` compositions both start and pass the same
   application contract smoke tests without branching core/application code.
8. Agent Boss can inspect organization, assign work, resolve an approval, and
   read the complete responsibility chain in the browser at 320, 768, 1024, and
   1440 px with keyboard-accessible controls and no console errors.
9. Backup/restore round-trip, structured audit/health output, dependency audit,
   secret scan, and security-header checks pass.
10. `OfficeScene 1.0`, `AssetManifest 1.0`, and `ActionSequence 1.0` are frozen;
    a deterministic 2D renderer passes conformance/golden-layout tests and no
    inward layer contains DOM or 3D runtime concepts.

## Ordered task slices

Every task is limited to one behavior and normally 2–5 files. Each checkpoint
ends with a clean commit and the relevant focused tests.

### Phase 0 — canonical baseline

- [x] Import the verified repository history into the current workspace.
- [ ] Record the relocation and remove stale absolute path claims from handoff
  docs. Verify `git status`, history, and baseline tests.
- [ ] Install exactly the lockfile with `npm ci`; run dependency audit and record
  the result.

Current re-baseline note (2026-08-18): the standalone Company OS verification
passes 68 tests plus boundary, upstream-governance, secret scan, production
dependency audit, type, and Vite build checks
when the runner permits loopback binding. The HTTP integration tests fail with
`listen EPERM` only in restricted sandboxes that prohibit all sockets; CI and
admission runners must allow an isolated loopback ephemeral port.

### Phase 1 — trust boundaries and application pipeline

- [ ] Define stable application errors, clock/ID sources, operating mode, and
  organization context contracts.
- [ ] Replace duplicated Demo fixtures with one immutable DemoCompany template.
- [ ] Introduce a CompanyOperations application service for assigning/advancing
  work through event, approval, and evidence ports.
- [ ] Make DemoRuntime a composition over CompanyOperations instead of a
  separate business state machine.
- [ ] Add isolation/promotion sanitizer tests: template only, mandatory identity,
  agent, permission, and responsibility rebinding.

#### Checkpoint 1

- Demo unit/integration tests pass with deterministic IDs/time.
- Test doubles observe zero network, process, filesystem, model, or credential
  calls.
- Existing boundary/type/build gates remain green.

### Phase 2 — neutral company and responsibility model

- [ ] Add project/workspace/position/reporting-line entities and invariants.
- [ ] Add goal/plan/tool-activity/evidence/result records.
- [ ] Add permission grants, data authorization contracts, autonomy/risk policy,
  and exact approval bindings.
- [ ] Add immutable responsibility projection over the full event sequence.
- [ ] Add cross-company isolation and concurrency/idempotency abuse tests.

### Phase 3 — durable store and service boundary

- [ ] Implement an in-memory contract adapter for deterministic integration tests.
- [ ] Implement a local durable append-only store with atomic replace, optimistic
  sequence checks, bounded records, and organization partitioning.
- [ ] Add snapshot/restore and corruption-detection behavior.
- [ ] Create a minimal HTTP service composition with input-size limits,
  structured errors, health/readiness, and no stack leakage.
- [ ] Add integration tests for restart durability and concurrent append conflict.

#### Checkpoint 2

- Organization/work/approval/evidence survives service restart.
- Backup → clear test instance → restore produces the same digests.
- No production record can be read across organization boundaries.

### Phase 4 — identity, authorization, and approval security

- [ ] Define formal session assertions with issuer/audience/organization/expiry
  and inject a verifier behind `IdentityPort`.
- [ ] Implement local enterprise and Raft-claim adapters with the same contract;
  use fixture assertions only.
- [ ] Add centralized authorization for every protected application command.
- [ ] Enforce approval actor, scope, expiry, single decision, exact digest, and
  permission-at-decision-time.
- [ ] Add spoofing, replay, confused-deputy, cross-tenant, and privilege-change
  abuse tests.

### Phase 5 — connector protocol and conformance

- [ ] Replace the envelope cast with message-specific runtime parsers and bounded
  payload rules.
- [ ] Add connector registration, version/capability negotiation, identity
  binding, health, and proof verification.
- [ ] Implement idempotent submit/progress and pause/resume/cancel state rules.
- [ ] Create a reusable conformance harness.
- [ ] Make deterministic Raft-shaped and enterprise-reference connectors pass
  the same harness without carrying credentials or private sessions.

#### Checkpoint 3

- Two connector implementations pass identical conformance tests.
- Duplicate requests do not duplicate work or evidence.
- Expired/invalid proof, unsupported capability, and illegal transitions fail
  with stable errors.

### Phase 6 — model and data governance

- [ ] Add credential-reference metadata and prohibit secret material by schema
  and scan.
- [ ] Implement model policy/routing with provider/session isolation and bounded
  consumption; use deterministic reference providers only.
- [ ] Implement data-source registration and authorization-contract evaluation.
- [ ] Implement default-deny egress decisions with purpose, field, destination,
  size, and evidence constraints.
- [ ] Persist model/data/egress audit decisions and expose sanitized projections.

### Phase 7 — Agent Boss product vertical

- [ ] Split the Web shell into accessible organization, work, approval,
  responsibility, connector, and model/data views.
- [ ] Connect views to the same application client used by Demo/formal profiles.
- [ ] Deliver the full three-minute Demo path including approve/reject, failure,
  reset, and sanitized promotion preview.
- [ ] Deliver formal fixture-mode create organization → assign work → approve →
  responsibility history flow.
- [ ] Add loading, empty, error, offline, and unauthorized states.

### Phase 8 — deployment, operations, and hardening

- [ ] Add managed-cloud and self-hosted composition roots plus explicit config
  validation and safe defaults.
- [ ] Add structured logs, audit events, health/readiness, and bounded metrics.
- [ ] Add security headers, origin policy, request limits, and safe shutdown.
- [ ] Add CI using `npm ci`, full verification, secret scan, and dependency audit.
- [ ] Add deployment smoke, backup/restore, accessibility, responsive, and browser
  E2E verification.

#### Checkpoint 4

- Both profiles start independently and pass the same product smoke flow.
- Zero critical/high reachable dependency findings and zero detected secrets.
- Browser has no console errors; keyboard and responsive checks pass.

### Phase 9 — Office Compiler Pre-3D v1

- [ ] Define room modules, adjacency, capacity upgrades, projects, circulation,
  and deterministic placement constraints.
- [ ] Define entity presence/state independently from work/event storage.
- [ ] Freeze `AssetManifest 1.0`: semantic slots, variants, units, anchor points,
  bounds, interaction points, and accessibility fallback—metadata only.
- [ ] Freeze `ActionSequence 1.0`: turn, move, type, carry, drink, enter/exit,
  wait, block, request approval, and celebrate—semantic timing only.
- [ ] Expand `OfficeScene 1.0` with coordinate space, layers, placements, actions,
  and version/deprecation semantics.
- [ ] Build renderer conformance and deterministic golden-layout tests.
- [ ] Complete the owned 2D/DOM renderer for all scene states and asset slots.

#### Final Pre-3D checkpoint

- All ten binary exit criteria pass.
- Product charter/ADRs/API docs and asset-production brief match frozen v1
  contracts.
- Repository contains no Blender, GLB, Three.js, mesh, texture, rig, or actual
  3D asset production.
- Goal stops here and reports that 3D asset production may begin separately.

## Stop-and-ask conditions

Stop for user direction before using real credentials, paid APIs/models,
production data, external publication, irreversible identity/authorization
semantics, destructive migration, or actual 3D production.
