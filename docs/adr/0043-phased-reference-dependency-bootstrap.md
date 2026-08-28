# ADR 0043: Phase-bound reference dependency bootstrap

## Status

Accepted on 2026-08-27.

## Context

The staging product cannot migrate or start until its dedicated PostgreSQL,
enterprise OIDC reference provider, Vault, Secret Broker, and Agent Node are
real, mutually TLS-authenticated runtime boundaries. A plan or a collection of
generated files does not prove those dependencies exist. Vault initialization
also creates recovery material and an initial root token, so retrying it or
passing its output through command arguments would create an unacceptable
Secret and lifecycle boundary.

## Decision

Use a separately authorized dependency phase before migration. It:

1. binds the canonical site contract and exact immutable images;
2. obtains service ownership from each image's account database, using an
   explicit account only where the runtime contract declares one;
3. writes consumer-specific read-only Secret projections;
4. creates only the site-owned product and dependency runtime objects;
5. initializes Vault once through an internal one-shot Ops service, verifies a
   narrowly scoped AppRole, revokes the initial root token, and never emits
   Secret material as evidence;
6. authenticates the Broker and Agent health checks over the supplied internal
   CA; and
7. emits `DEPENDENCIES_READY_NOT_PRODUCT_MIGRATED` only after the entire chain
   passes.

Planning remains non-mutating. A failed apply writes a review-required state.
It does not remove networks or volumes, retry Vault initialization, migrate the
product database, start product services, or claim rollback or acceptance.

The active Hong Kong and standby Hangzhou sites execute this phase separately.
They share no database, OIDC client, Vault state, AppRole, network, volume, or
runtime credential.

## Consequences

- Migration and product start can verify a cryptographic digest of their exact
  predecessor evidence.
- The Ops image is a privileged operator boundary because it receives the
  Docker socket during an explicitly authorized run; no long-lived product
  service receives that authority.
- Only the dependency apply operator receives `CAP_CHOWN`, solely to assign
  generated `0400` OIDC configuration and Secret projections to the non-root
  identities resolved from exact images. Planning, later phases, and long-lived
  containers retain `cap-drop ALL` without that capability.
- PostgreSQL and Caddy account names/IDs are checked against the exact image
  rather than guessed from the host.
- Off-site backup and public ingress remain separate capabilities and are not
  implied by dependency readiness.
