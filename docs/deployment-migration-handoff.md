# Deployment and migration handoff

Status: Pre-3D contract frozen on 2026-08-20.

## One codebase, two profiles

`managed-cloud` and `self-hosted` compose the same core/application packages.
They differ only at adapter selection: Raft Identity is the replaceable managed
default; enterprise OIDC is the self-hosted default. Identity issuer, audience,
tenant and authorization remain product-scoped.

Both profiles expose `DurableControlPlaneStorePort`. Managed-cloud admission
fails unless its injected adapter supports atomic event/outbox commits,
idempotent delivery, monotonic projection checkpoints, versioned backup and
empty-target restore. Self-hosted uses `LocalDurableControlPlaneStore` with the
same contract.

## Upgrade sequence

1. Run `npm ci --ignore-scripts` from the exact lockfile.
2. Run `npm run verify`; this includes 101 focused tests, dependency/boundary/
   independence/secret guards, type/build, and five browser E2E cases.
3. Export a tenant-scoped backup through `exportBackup(companyId)` and retain
   its digest with the release record.
4. Stop command ingestion, drain or preserve pending outbox publications, then
   deploy one immutable application revision.
5. Start the selected profile and verify `/health`, `/ready`, formal identity
   audience/tenant, event sequence, pending outbox and projection checkpoints.
6. Resume ingestion only after the smoke checks pass.

No migration step needs a real model key, Agent credential, private session, or
production payload in this repository.

## Schema migration and rollback

The local adapter reads legacy `{companyId}.events.json` as an immutable
rollback source. Its first new commit creates `{companyId}.control-plane.json`;
it never rewrites the legacy file. The versioned backup covers events, outbox
and checkpoints and is rejected if its digest/schema/tenant is altered.

Rollback uses a new empty target store and `restoreBackup(companyId, backup)`.
Restore refuses to overwrite existing state. Application rollback is safe only
when the prior binary supports the restored schema; otherwise keep the current
binary and restore to a parallel validation target before cutover.

FDE packages are not destructive migrations. Apply and rollback are append-only
events; `EventBackedCompanyConfigurationProjection` replays the active
organization, responsibility, Connector and governance catalogs after restart.

## Independent ownership

Paperclip and all other audited competitors are absent from runtime, build,
deployment and data formats. Raft may mount or link Company OS through the narrow
host contract and provide Raft-specific Identity/Connector/serializer adapters;
it cannot own Company OS business logic or its database lifecycle.

The next separate goal may create 3D assets against `OfficeScene 1.0`,
`AssetManifest 1.0` and `ActionSequence 1.0`. It must not change these deployment
or responsibility boundaries implicitly.
