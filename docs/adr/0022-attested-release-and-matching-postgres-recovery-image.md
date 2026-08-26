# ADR 0022: Attested release and matching PostgreSQL recovery image

Status: Accepted
Date: 2026-08-25

## Context

Company OS had separate API and Web images plus a safe restore command, but the
restore command depended on `pg_dump` and `pg_restore` being installed on the
operator workstation. A first operations-image build on Debian Bookworm
installed PostgreSQL client 15 while the declared database baseline is
PostgreSQL 16. That mismatch would make the documented recovery path fail even
though unit tests around its safety checks passed.

A release also needs to bind source revision, application dependencies,
database migrations and all executable images. Publishing only mutable tags or
an unattested API/Web pair would leave the recovery tool outside the release
and make rollback evidence incomplete.

## Decision

- Every release contains five independently runnable images: API, Web,
  operations, the Codex acceptance Agent Node and the Vault Secret Broker. The
  execution components are optional deployment units but canonical attested
  release artifacts.
- The operations image takes `pg_dump` and `pg_restore` from the official
  the current admitted PostgreSQL 16.15 Bookworm image and adds the exact Node
  22.12 runtime needed by
  the Company OS restore validator. It runs as UID 1000.
- The release manifest requires digest-addressed coordinates for all five
  images and records the exact source revision, lockfile digest, ordered
  migration digests, public protocol versions, runtime versions and required
  qualification commands.
- Release automation separates a read-only `qualify` job from the privileged
  `publish` job. The exact release revision must pass repository, database,
  identity, verified-TLS customer-boundary, sustained-soak and both deployment
  Profile gates before registry login or image publication is possible.
- The GitHub release job builds each image with image-level SBOM and maximum
  provenance, adds GitHub artifact attestations, and retains the manifest and
  application CycloneDX SBOM as release evidence.
- Release execution is protected by the `production-release` environment and
  refuses to proceed until a repository-wide `LICENSE` exists. This ADR does
  not choose that license.
- CI runs an isolated PostgreSQL 16 restore admission. It creates a source and
  empty target database, migrates and seeds the source, performs a custom-format
  dump/restore through the operations image, validates the restored schema and
  compares a production-labelled marker event. All credentials and Docker
  resource names are random and temporary.

## Alternatives considered

### Require PostgreSQL tools on the operator host

Rejected because host package versions and extensions are not part of the
Company OS release, so the documented recovery path would not be reproducible.

### Install Debian's unversioned `postgresql-client`

Rejected after the real build produced client 15. The supported server major
must not be inferred from a distribution default.

### Put restore tools in the API image

Rejected because backup tooling and its extra packages increase the steady
state API image and attack surface. Recovery is an explicit operator lifecycle,
not a request-serving responsibility.

### Publish tags without attestations

Rejected because tags alone do not prove which workflow, source revision and
dependency graph produced the executable images.

## Consequences

- Operators can run the same restore validator locally, in CI and in either
  deployment Profile without installing PostgreSQL tools on the host.
- The operations image is part of compatibility and vulnerability management,
  not an informal support script.
- The repository-wide license gate is satisfied by Apache-2.0 under Copyright
  2026 Yilun Ye; third-party notices remain separately retained.
- Restore admission proves recoverability of the declared schema and retained
  data; encrypted backup storage, retention scheduling and production cutover
  remain operator deployment responsibilities and require separate evidence.

## References

- GitHub artifact attestations:
  https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations
- GitHub container publishing:
  https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images
