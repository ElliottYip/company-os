# ADR 0037: authorized staging restart state machine

Status: accepted, 2026-08-26.

## Context

Process restart is a mutating operator action. Health probes alone cannot prove
that accountable work, pending Connector commands, approvals and Secret leases
were not abandoned. A sequence of manually copied commands also cannot provide
one reviewable failure state or prevent concurrent start/restart writers.

## Decision

Company OS provides one explicit staging restart state machine. It requires an
opaque operation ID, an external change-authorization reference, the exact
installed release and an already healthy `RUNNING_NOT_ACCEPTED` runtime.

Start and restart share `.staging-lifecycle.lock`. Restart then:

1. derives `DRAINED` from the Company OS database and retains an immutable,
   private operation-specific pre-drain record;
2. restarts only the Compose `api` service and waits for readiness;
3. restarts only the Compose `web` service and waits for reachability;
4. reconciles exact digest-addressed runtime images and health; and
5. verifies that the exact durable source digest was adopted unchanged.

The final record is written once under `restart-records/<operation>.json` and
the operation ID cannot be replayed. The current state is atomically updated in
`restart-state.json`. Records contain only release, authorization, stable phase,
aggregate digest and timestamps—never command output, tenant identifiers or
Secret material.

Any failure stops at `RESTART_FAILED_REQUIRES_REVIEW`. Company OS records whether
a service restart may already have run and never attempts an automatic database
rollback or claims customer acceptance.

## Consequences

This is an operational adapter over Company OS-owned state, not domain logic.
It adapts Paperclip's useful supervised restart sequencing while closing the
audited authority, artifact-binding and optional-preservation gaps. It does not
import Paperclip runtime, service state or schema.
