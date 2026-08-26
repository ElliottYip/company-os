# ADR 0034: Start a prepared staging release through an authorized state machine

## Status

Accepted, 2026-08-26.

## Context

ADR 0033 ends at `PREPARED_NOT_STARTED`. A copied Compose file is not an
operational product: image pulls, migrations, role provisioning, service
startup and readiness are distinct side effects with different failure
semantics. Running them as an operator's ad-hoc shell history would lose the
release coordinate, initiating authority and ambiguous database state.

Paperclip's service lifecycle at pinned MIT commit
`213dabab4f8e1f3bb1803a2924c0fea1289fcd4c` informed the shape. The reviewed
files are `cli/src/services/service-manager.ts`, `cli/src/commands/run.ts`,
`cli/src/commands/update.ts` and representative service-manager, run and doctor
tests. They demonstrate useful separation between installation, validation,
runtime and update, plus single-writer and retained-state behavior. No
Paperclip source, internal type, schema, package or service is copied.

## Decision

`release:staging-start` is the only repository-owned first-start sequence.

- Default execution is a non-mutating plan. Side effects require `--apply`.
- The request binds one exact `PREPARED_NOT_STARTED` release ID and a stable,
  non-secret external authorization reference.
- The retained bundle is verified again. API, Web and Ops image coordinates in
  the public environment must exactly match its release manifest.
- The doctor and Compose public configuration must name the same absolute
  Secret directory; the start cannot validate one path and mount another.
- A `wx` lock permits one writer. A retained startup state or abandoned lock
  requires operator review rather than an invented automatic recovery.
- Apply runs the first-install doctor, Compose validation, exact image pull,
  migration, runtime-role provisioning, API start/readiness, Web start/smoke and
  a final API readiness probe in that order.
- `startup-state.json` is atomically rewritten with mode `0600`. It stores only
  the release, authorization reference, stable step IDs, timestamps and status;
  stdout, stderr, credentials and Secret values are never retained.
- The only success state is `STARTED_NOT_ACCEPTED`. Customer acceptance,
  ingress movement and production readiness require separate evidence.
- Failure becomes `START_FAILED_REQUIRES_REVIEW`. If migration was attempted,
  the state says it may have run. The tool never executes a down migration,
  deletes the candidate, starts a replacement database or claims rollback.

The command runs from the exact attested Ops image. Its Docker socket grants
daemon-level authority, and its staging-root write mount permits only the lock
and state lifecycle. Secrets are mounted read-only, remain file-injected into
the product containers and are not accepted as command arguments.

## Consequences

The first staging start is repeatably explainable: which release was proposed,
which external change record authorized it, which step was last attempted and
whether database state may have changed. It is intentionally conservative: a
failed or interrupted start pauses for review instead of promising unattended
repair. Future upgrade, cutover and rollback automation can consume these
stable states without making Paperclip an upstream or runtime dependency.
