# ADR 0032: Staging installation begins with a read-only doctor

## Status

Accepted, 2026-08-26.

## Context

A valid Compose file does not prove that a target host is safe to mutate. An
operator must first know whether the instance root exists with safe ownership
mode, immutable images are selected, public HTTPS coordinates are complete,
Secret files are regular and private, loopback ports are free, and the host has
the declared resource budget.

Paperclip's pinned CLI onboarding, managed-install provenance, data-directory
doctor and service-health checks informed this lifecycle boundary. The relevant
audited paths are `cli/src/commands/onboard.ts`, the service manager/health
checks recorded in audit batches 1500–1530, and commit
`213dabab4f8e1f3bb1803a2924c0fea1289fcd4c` (MIT). No source code was copied.
The Company OS audit found that boolean install outcomes and ambient service
authority are insufficient for accountable enterprise deployment.

## Decision

`npm run ops:doctor:staging` is the canonical first-install preflight for the
isolated staging profile.

- It is read-only: filesystem metadata, Docker/Compose availability, target
  project/network existence, host capacity and loopback port state are probed.
- It parses only a public environment file. Credential-shaped keys are rejected
  before retention; Secret file contents are never opened.
- Secret admission uses `lstat`, rejects symlinks/non-files, group/world access,
  empty files and files larger than 16 KiB.
- API and Web images must use exact OCI SHA-256 digests. OIDC, Agent Node, Data
  Node and Secret Broker coordinates must be HTTPS.
- Results use stable codes and `READY`/`NOT_READY`; an unobservable port is
  `STAGING_PORT_PROBE_FAILED`, never guessed free or occupied.
- First-install mode refuses a pre-existing Compose project or network. Upgrade
  reconciliation remains a separate, explicitly authorized lifecycle.

The doctor does not create directories, fix permissions, pull images, create
networks, write configuration, start containers, request certificates or claim
acceptance.

## Consequences

Operators get a deterministic repair list before any staging side effect, and
automation can consume stable codes without parsing prose. A passing doctor is
necessary but not sufficient: immutable release qualification, migrations,
external-boundary preflight and customer browser acceptance still follow.

The handoff into that lifecycle is produced by `release:staging-bundle`. It
accepts only a valid immutable Company OS release manifest, copies a fixed
allowlist of Compose, license and runbook files, writes per-file SHA-256
digests, declares that no Secret material is included, refuses an existing
destination, and can verify the received directory before the doctor is run.
It does not package images or credentials.

The next boundary is defined separately by
[ADR 0033](0033-versioned-staging-release-store.md): verification and atomic
retention may prepare a release, but preparation must not be reported as a
started service or successful cutover.
