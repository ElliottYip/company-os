# ADR 0019: One-codebase release and operations contract

Status: Accepted
Date: 2026-08-25

## Context

Company OS supports a product-operated managed cloud and customer-operated
self-hosted/local enterprise installations. Maintaining two business codebases
would make responsibility, approval and evidence semantics drift. Treating a
mutable image tag or an English deployment note as a release record would also
make an incident impossible to reconstruct precisely.

## Decision

Both profiles use the same source revision, PostgreSQL migrations, API image
and Web image. Profile selection changes composition and infrastructure
ownership only. A release is admitted only with:

- an exact 40-character source revision;
- API and Web image references pinned by SHA-256 digest;
- the package-lock digest and every ordered migration digest;
- an SBOM produced from the exact lockfile and attached by the release system;
- a restored-copy migration rehearsal and a recorded rollback decision;
- `/ready` plus the organization → Work → approval → evidence smoke path.

Credentials, identity tokens, evidence bodies and external Agent sessions are
not release metadata. Managed deployments inject credentials from their secret
manager. Customer credentials and execution remain with customer-controlled
Broker and Connector nodes when that deployment topology is selected.

Database migrations are forward-only. Rollback means using a schema-compatible
prior binary or restoring the paired pre-upgrade backup into a parallel target
and cutting over deliberately. Company OS never attempts an automatic
destructive down-migration.

## Alternatives considered

### Separate managed-cloud and self-hosted implementations

Rejected because it duplicates responsibility semantics and doubles the
security and migration patch surface.

### Mutable tags with an operator deployment log

Rejected because tags can move and do not bind a release to its migrations or
dependency graph.

### Automatic database down-migrations

Rejected because evidence and responsibility records are legally and
operationally sensitive; an automatic reverse transformation can silently lose
new state. Parallel restore and controlled cutover are slower but auditable.

## Consequences

- `deploy/compose.managed-cloud.yml` is a portable reference topology, not a
  claim that Compose is the production orchestrator.
- Orchestrator-specific charts/modules may wrap this contract but may not fork
  domain code or migrations.
- Release automation must retain the manifest, SBOM, backup drill result and
  smoke evidence together.
- A release without immutable image digests or restore evidence is not a
  production release even if the application starts.
