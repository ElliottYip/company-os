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

The authorization also binds the digest of a separate, Secret-free candidate
runtime contract. That runtime contract is rendered from the active site and
candidate release but has its own Compose project, container/service names,
network aliases, loopback ports, candidate database reference, and resource
budget. It must not reuse active `api`, `web`, Broker, Agent Node, or Data Node
DNS aliases on the same Docker network. When any execution-plane image changes,
the candidate service runs beside the active service under a candidate-specific
ID until cutover; an installed image alone is not readiness evidence.

The candidate database credential set lives in a separate target-owned Secret
projection and points only to the empty parallel restore target. Neither the
authorization nor the runtime contract contains that coordinate or Secret.
The active public reverse proxy continues to target the active loopback ports
until the traffic phase. Candidate smoke and state comparison use candidate
loopback ports or a one-shot verifier on the candidate network, never the
customer hostname.

The candidate resource contract covers the complete parallel product and
execution plane, not only API and Web. The current templates require at least
2.5 GiB declared candidate memory, 2.5 CPU, 640 PIDs, and 1 GiB host headroom.
Target preflight may require more to preserve the active site and host reserve;
it must never treat swap as admitted capacity. The candidate Broker, Agent
Node, fixture Data Node, and TLS gateway have distinct state volumes, mount one
candidate Secret projection read-only, publish no host ports, and join only the
candidate product network. Vault is an explicitly supplied same-site HTTPS
dependency; no credential is placed in the runtime contract or public env.

Before any candidate runtime object is created, capacity admission binds the
runtime contract to the active site manifest and evaluates active declared
limits plus candidate declared limits plus the larger required host reserve.
Both total and currently available memory must pass; CPU and PID capacity must
also cover both stacks. Swap is reported as non-admitted and cannot turn a
failure into a pass. This means the current Hong Kong 4 CPU shape is not
pre-approved merely because it has 8 GB memory: its observed snapshot must
pass, and the present declared 5.55 CPU parallel requirement does not fit 4
logical CPUs.

Capacity admission is the first preparation step. Dispatch remains open when
it fails, because no active or candidate mutation has started. The retained
capacity evidence digest is required by the cutover plan and must precede
dispatch freeze, backup, restore, migration, or candidate creation.

Capacity checks produce five-minute, append-only target evidence bound to the
exact runtime contract and active site manifest. A private relative symlink may
advance to a newer observation after resizing, but older records are retained;
only a non-expired `READY_FOR_CANDIDATE_CREATION` record can satisfy the first
preparation step. The preparation adapter then requires a named,
outcome-bound evidence record for every operation instead of accepting an
untyped shell success.

Planning is non-mutating. The preparation executor may freeze dispatch,
reconcile work, create an encrypted backup, rehearse restore into an empty
parallel database, migrate that candidate database, start candidate services
with ingress closed, and retain readiness/state-comparison evidence. It may not
route customer traffic.

Candidate dependency order is explicit: Secret Broker first, fixture Data Node
second, Agent Node third, then API and dependency-aware readiness. Checking API
readiness before its execution dependencies is forbidden. The Compose adapter
uses fixed service commands, verifies exact immutable images and running/health
state, probes only candidate loopback endpoints, and writes normalized private
evidence without retaining command output.

Active dispatch freeze uses the existing instance-maintenance API over a
loopback-only origin. The administrative session is read from a private file,
held only in memory, and omitted from evidence. The operation uses optimistic
revision, is idempotent only for the same operation and authority, and confirms
the stored state after mutation. Drain reconciliation then uses the durable
cross-company drain projection and admits only zero non-terminal Attempts,
pending approvals/publications, and unrevoked leases; retained evidence contains
aggregate counts and a source digest, never customer records.

The database preparation adapter composes the maintained streaming
AES-256-GCM PostgreSQL backup and authenticated restore implementation. It
reads the active URL, parallel-target URL, and encryption key only from private
target-owned files and never retains those coordinates or any digest derived
from them. The target is bound by a separately supplied opaque runtime-contract
reference. Restore first authenticates the ciphertext and streams the previous
schema into an explicitly empty parallel restore target using connectivity-only
validation; it does not incorrectly compare that previous schema with the
candidate schema. A separate forward-migration operation then applies the
candidate migration set once and validates the current schema. Each transition
is append-only, ordered, digest-bound, and fails closed on target-reference or
ciphertext drift.

Traffic movement is a second apply phase requiring the exact
`trafficCutover` reference and successful preparation evidence. It changes the
active route, observes bounded health/integrity thresholds, then atomically
records the candidate as active. Installing a candidate never changes active
runtime authority.

The traffic executor consumes the exact digest of the completed, unrouted
preparation state under the separate traffic authorization. It permits only
`route-traffic` followed by `observe`. A route or observation failure retains
whether traffic may have moved and stops in
`TRAFFIC_CUTOVER_FAILED_REQUIRES_EXPLICIT_DECISION`; it never invokes rollback
or claims acceptance. A successful observation ends only at
`UPGRADE_OBSERVATION_COMPLETE_PENDING_ACCEPTANCE`.

Rollback is never automatic. A failure after any possible database or service
mutation records `UPGRADE_FAILED_REQUIRES_REVIEW`, the last attempted step, and
whether migration, service, or traffic mutation may have occurred. The
separate rollback reference may restore the paired backup only into an empty
parallel database, validate the previous state, start the previous immutable
images, and move traffic only by explicit operator action. It never performs a
down migration or runs the previous binary against the candidate database.

The rollback executor now enforces that decision. It accepts only a failed
traffic state whose exact digest says traffic may have moved, and only the
separate rollback authority. Its fixed sequence closes candidate ingress,
retains the failed database, restores the paired backup into an empty parallel
target, validates the previous state, starts previous immutable images, runs
the previous smoke path, and moves ingress by explicit operator action. Even a
successful rollback leaves dispatch closed and acceptance pending.

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

### Reuse the active Compose project and product network

Rejected because Compose service aliases such as `api` and `web` would collide,
the same host ports cannot be bound twice, and replacing an active container is
already a traffic mutation. It would make pre-cutover smoke and rollback
ambiguous.

## Consequences

- Later Ops images can upgrade immutable RC4 without rewriting or relaxing its
  site contract.
- Preparation, traffic movement, and rollback can be independently approved
  and audited.
- Actual upgrade completion still requires two published releases, target
  Secrets, a running site, and external operator authorization; repository
  tests cannot fabricate that evidence.
- The next implementation must define and resource-check the candidate runtime
  contract before adding separate preparation and traffic executors. It must
  not modify the existing first-start or restart authority semantics.
