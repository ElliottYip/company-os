# ADR 0040: evidence-bound staging dependencies

Status: accepted, 2026-08-26.

## Context

An immutable Company OS image does not make a staging deployment reproducible
when PostgreSQL, identity, Secret Broker, Agent Node, Data Node, ingress and
backup storage are supplied through unrelated operator notes. A valid public
environment file can still point at the wrong tenant, a shared production
resource, a weak transport or a dependency whose accountable owner is unknown.

Paperclip's mature service lifecycle reinforces the need to validate external
dependencies before process mutation. Company OS additionally needs each
enterprise boundary to retain a real owner and evidence reference without
copying credentials into the control plane or release state.

## Decision

The raft.xin staging profile requires one versioned, non-secret dependency
manifest. It binds:

- the exact Web/API origins, deployment root, Compose project, network and
  loopback ports;
- dedicated PostgreSQL 16 with full TLS verification;
- one product-scoped OIDC client with S256 PKCE;
- distinct HTTPS Vault Broker, Agent Node and Data Node origins;
- one dedicated, versioned ZOS backup bucket; and
- an opaque accountable owner and evidence reference for every capability.

The boundary parser is structurally exact. It rejects unknown fields,
placeholders, embedded URL credentials, weak transport, duplicate dependency
origins, known Buzz/Raft production coordinates and recognizable credential
material. Database coordinates and all authentication material remain in
separate protected files.

The startup planner validates the private regular file, records its canonical
SHA-256 digest and applies the same validator again as the first execution
step. Runtime inspection recomputes the digest and reports drift. Authorized
restart carries the startup-bound digest into every operation record.

The checked-in JSON file is a deliberately invalid template: its placeholders
must be replaced with independently verified staging resources before it can
pass admission. A passing manifest proves only configuration ownership and
shape; it does not claim that customer acceptance or production readiness has
occurred.

## Consequences

Staging can no longer start from a collection of unowned URLs or silently
reuse known production resources. Dependency changes are explicit, reviewable
and visible after startup. The manifest contains no Secret values and is not a
substitute for verified TLS probes, release attestations, restore drills or the
customer acceptance record.
