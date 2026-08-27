# ADR 0044: Versioned staging upgrade authorization outside the site contract

## Status

Accepted on 2026-08-27.

## Context

RC4's immutable site-runtime schema contains separate first-start authorities
for dependency initialization, migration/provision, product start, and
acceptance. It does not contain upgrade or traffic-cutover authority. Adding
new required keys to schema version 1 would make a later Ops image unable to
read the exact RC4 contract and would break the first real upgrade. Reusing a
first-start ticket would also give one approval authority over backup,
migration, candidate execution, and public traffic movement.

The release cutover planner already proves release ordering, exact migration
prefix compatibility, immutable image changes, and the parallel-database
rollback strategy. It is deliberately non-executable and cannot by itself
authorize a target mutation.

## Decision

Keep site-runtime schema version 1 readable and unchanged. Introduce a separate
Secret-free `staging-upgrade-authorization.json` contract for each upgrade
operation. The exact contract binds:

- one site ID and one opaque operation ID;
- the active release ID, source revision, release-manifest digest, and current
  startup-state digest;
- the candidate release ID, source revision, release-manifest digest, and
  adopted site-contract digest;
- the deterministic cutover-plan ID and plan digest;
- distinct `preparation`, `trafficCutover`, and `rollback` authorization
  references; and
- an expiry time and accountable operator reference, neither of which is a
  credential or customer coordinate.

Planning is non-mutating. The preparation executor may freeze dispatch,
reconcile work, create an encrypted backup, rehearse restore into an empty
parallel database, migrate that candidate database, start candidate services
with ingress closed, and retain readiness/state-comparison evidence. It may not
route customer traffic.

Traffic movement is a second apply phase requiring the exact
`trafficCutover` reference and successful preparation evidence. It changes the
active route, observes bounded health/integrity thresholds, then atomically
records the candidate as active. Installing a candidate never changes active
runtime authority.

Rollback is never automatic. A failure after any possible database or service
mutation records `UPGRADE_FAILED_REQUIRES_REVIEW`, the last attempted step, and
whether migration, service, or traffic mutation may have occurred. The
separate rollback reference may restore the paired backup only into an empty
parallel database, validate the previous state, start the previous immutable
images, and move traffic only by explicit operator action. It never performs a
down migration or runs the previous binary against the candidate database.

Upgrade state and retained evidence contain only digests, opaque IDs, bounded
status codes, and timestamps. Commands, output, database coordinates, identity
coordinates, Secret values, and customer data are excluded.

## Alternatives considered

### Add upgrade fields to site-runtime schema version 1

Rejected because exact-key parsing would make later tooling incompatible with
the immutable RC4 contract.

### Treat a new schema version 2 as mandatory

Rejected for the first upgrade because it still requires a separate migration
of the authorization contract before the new tool can safely act. A future
site schema may add non-upgrade fields while the operation contract remains
independently versioned.

### Reuse product-start or acceptance authority

Rejected because neither authorizes backup, parallel migration, candidate
readiness, traffic routing, or rollback. It would collapse distinct human
responsibilities into one broad ticket.

### Execute the existing cutover plan directly

Rejected because a compatibility plan is evidence, not authority. It has no
site binding, expiry, accountable operator, or phase-separated permission.

## Consequences

- Later Ops images can upgrade immutable RC4 without rewriting or relaxing its
  site contract.
- Preparation, traffic movement, and rollback can be independently approved
  and audited.
- Actual upgrade completion still requires two published releases, target
  Secrets, a running site, and external operator authorization; repository
  tests cannot fabricate that evidence.
- The next implementation must first add exact parser and plan tests, then
  separate preparation and traffic executors. It must not modify the existing
  first-start or restart authority semantics.
