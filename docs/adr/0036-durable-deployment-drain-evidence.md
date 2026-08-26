# ADR 0036: durable deployment drain evidence

Status: accepted, 2026-08-26.

## Context

A healthy process is not evidence that a planned restart preserved accountable
work. Company OS must also account for Connector delivery, exact approvals and
execution-edge Secret leases. The Paperclip lifecycle audit identified useful
supervisor health and optional drain-report concepts, but also found that a
nullable preservation report is not bound strongly enough to runtime artifacts
or operator authority for Company OS.

## Decision

Company OS derives a read-only drain assessment from its own PostgreSQL event
stream and Connector outbox through `DeploymentDrainStatePort`. The application
policy blocks a planned restart while any of the following exists:

- a non-terminal Work Attempt, including `OUTCOME_UNKNOWN`;
- an undecided exact approval;
- a pending Connector outbox publication; or
- an issued Secret lease without durable revocation evidence.

The Ops inspector accepts the database URL through the existing `_FILE` Secret
boundary. It emits only stable codes, aggregate counts and a canonical SHA-256
digest of the exact source state. It never emits company IDs, Work IDs, event
payloads or database credentials. Malformed relevant records fail closed.

This deliberately strict first policy may require work to finish, cancel or be
reconciled before maintenance. A future preservation/adoption policy may admit
specific paused states only after Connector capabilities and lease semantics can
prove safe adoption; it must not weaken this default by inference.

## Consequences

The pre-restart digest can be compared with a post-restart capture, alongside
the exact runtime image status from ADR 0035. Neither proof alone constitutes
customer acceptance. Adoption comparison accepts only a private, regular,
single-link pre-restart record and fails closed on any exact-source digest or
summary drift. The database adapter is replaceable and Paperclip types, schema
and services do not enter Company OS.
