# ADR 0039: persistent instance dispatch freeze

Status: accepted, 2026-08-26.

## Context

A point-in-time drain check can observe zero active work and still race with a
new dispatch before restart. Process-local maintenance flags are also lost when
the API is restarted and cannot establish who authorized the interruption.
Company OS therefore needs an instance-wide, durable admission boundary before
planned restart or upgrade work can claim that dispatch is closed.

Paperclip's pinned service lifecycle and drain-before-restart behavior identify
the general operational problem. Company OS has a stricter responsibility
model: the freeze must be a first-class Company OS state transition authorized
by a real instance administrator and retained independently of the service
process. No Paperclip schema, type, route or service-manager code is used.

## Decision

Company OS owns a revisioned singleton maintenance state. This ADR originally
defined two modes:
`OPEN` and `DISPATCH_FROZEN`. Every transition requires:

- a formally authenticated instance administrator;
- the expected current revision;
- a portable operation ID; and
- an external authorization reference.

The current row and an immutable audit event are written in one PostgreSQL
transaction. Formal accountable-work dispatch reads the maintenance port after
identity and tenant admission but before any organization, Work, Attempt,
outbox or Connector side effect. Frozen dispatch fails with the stable
`INSTANCE_DISPATCH_FROZEN` code.

The narrow instance-admin API exposes `GET` and origin-checked `PATCH` at
`/api/v1/instance/maintenance`. It does not accept credentials, Secret values,
free-form reasons or automatic expiry. Demo state cannot authorize a change.

Planned drain proof requires `DISPATCH_FROZEN`, includes the maintenance
revision in its bounded snapshot, and binds the complete maintenance state into
the non-reversible source digest. A restart therefore follows this order:

1. an administrator freezes dispatch;
2. existing attempts, approvals, outbox publications and leases finish or are
   resolved;
3. the drain inspector proves the frozen, empty boundary;
4. API and Web restart and adopt the exact durable state;
5. an administrator explicitly reopens dispatch after review.

ADR 0045 supersedes only the two-state transition rule. Reopening now requires
a bounded `ACCEPTANCE_ONLY` phase; the durable singleton, optimistic revision,
append-only audit, and drain decisions in this ADR remain in force.

Existing work is deliberately allowed to finish while dispatch is frozen; the
freeze is not a kill switch and does not cancel Connector activity.

## Consequences

The check-to-restart race is closed across API restarts and multiple API
replicas. Every interruption and reopening has accountable provenance, and an
unchanged or stale command fails closed. Operators must perform an explicit
freeze and reopen; Company OS will not silently trade availability for an
upgrade. Migration `0006_instance_maintenance` is additive, and rollback still
uses the parallel pre-upgrade database rather than a destructive down
migration.
