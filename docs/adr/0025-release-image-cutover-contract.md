# ADR 0025: Release image cutover contract

Status: Accepted
Date: 2026-08-25

## Context

The deployment admissions prove current-image restart recovery and the database
admission proves the frozen `0004` schema can migrate through the current image
and restore into a parallel rollback database. Neither result proves an actual
published N → N+1 application-image cutover. Re-tagging one image twice would
create convincing-looking but false upgrade evidence.

## Decision

- An application cutover requires two separately generated release manifests.
  The current semantic version and source revision must be newer/different and
  its API image digest must differ from the previous release.
- Both manifests must use the same supported PostgreSQL major and unchanged
  public protocol contracts. A change to either needs its own compatibility
  ADR and executable admission before this planner accepts it.
- Every prior migration name and digest must be an exact ordered prefix of the
  current history. Published migration files cannot be removed or rewritten.
- `npm run release:cutover-plan -- previous.json current.json` produces a
  deterministic, secret-free plan. Its status is always
  `PLANNED_NOT_EXECUTED`; producing a plan is never upgrade evidence.
- The ordered cutover freezes dispatch, reconciles every in-flight Attempt,
  retains a paired encrypted backup, proves parallel restore, applies any new
  migrations once, starts the candidate API behind closed ingress, checks
  dependency-aware readiness, runs the formal identity → company → work →
  approval → evidence smoke, compares control totals, starts Web, moves ingress
  and observes release thresholds.
- An older binary is never assumed compatible with the current schema.
  Rollback retains the failed database, restores the paired backup to an empty
  parallel database, validates it, then starts the exact previous image digests
  against that target before an explicit ingress decision.
- Completion needs every plan-generated evidence ID retained by the deployment
  operator. This repository cannot claim a real N → N+1 rehearsal before two
  real releases and a customer-owned staging boundary exist.

## Consequences

The first release can be qualified and published without pretending it was
upgraded from an earlier release. Starting with the second release, incompatible
runtime, protocol or migration changes fail before operator commands are run.
The cutover remains deliberately operator-controlled because backup location,
ingress, identity provider and incident authority belong to the deployment.

## Alternatives considered

### Tag the current image as both N and N+1

Rejected because it tests a restart, not application compatibility.

### Automatically start the old binary on the migrated database

Rejected because additive DDL does not prove that new responsibility or
evidence records are representable by the old application.

### Automatically overwrite the failed database during rollback

Rejected because it destroys incident evidence and the safest recovery source.
