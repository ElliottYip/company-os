# ADR 0035: Reconcile retained staging state with a read-only runtime status

## Status

Accepted, 2026-08-26.

## Context

The first-start record describes operator intent and the last completed step,
not current Docker reality. A process may stop, drift to another image or be
duplicated after that record is written. Conversely, container existence alone
cannot prove that the exact prepared release is healthy or accepted.

Paperclip's service health and manager implementation at pinned MIT commit
`213dabab4f8e1f3bb1803a2924c0fea1289fcd4c` usefully separates supervisor
status, process health and restart coordination. The completed audit also found
that supervisor-to-artifact binding, drift postconditions and mandatory
drain/adoption evidence were incomplete. Company OS adapts the distinction, not
the code or process model.

## Decision

`ops:status:staging` is a logically read-only reconciliation command.

- It verifies the marked release store and digest-bound prepared bundle before
  trusting either a state file or Docker output.
- It follows no symlink and accepts only a private regular startup-state file.
- Docker inspection is limited to the Compose project/service labels, configured
  image reference, process state and health state. It does not request container
  environment variables, mounts, command lines or logs.
- The exact API and Web image references must match the retained release
  manifest. Missing or duplicate services and unhealthy/stopped state fail
  closed.
- Loopback API readiness and Web reachability are observed independently from
  Docker health.
- Stable outcomes are `NOT_STARTED`, `RUNNING_NOT_ACCEPTED`,
  `START_INCOMPLETE_REQUIRES_REVIEW`, `START_FAILED_REQUIRES_REVIEW` and
  `DEGRADED_REQUIRES_REVIEW`.
- No outcome claims customer acceptance. Acceptance remains a separately owned,
  externally evidenced record.

The command runs in the exact Ops image with the staging root mounted read-only.
It still needs the Docker socket, which is daemon-level authority, so image
provenance and a short container lifetime remain mandatory.

## Consequences

Operators can distinguish a prepared release from a healthy exact runtime and
from partial or drifted state without reading Secrets or mutating the host. A
future restart command must consume a separate authenticated drain/adoption
proof; this inspector is deliberately insufficient authorization for restart.
