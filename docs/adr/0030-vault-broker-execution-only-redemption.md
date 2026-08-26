# ADR 0030: Vault-backed Secrets are redeemed only at the execution boundary

Status: Accepted
Date: 2026-08-26

## Context

Paperclip's pinned Secret implementation is the generic product reference for
company scoping, metadata/version separation, active/revoked lifecycle and
runtime injection. Company OS additionally promises that its control plane does
not possess model, Agent or data credentials and that every use is bound to an
exact Work Attempt and accountable authorization.

A neutral HTTP Secret Broker client already issues opaque leases, but staging
needs a maintained adapter that can prove real Vault compatibility and deliver
material to a Codex Agent Node without returning it through Company OS.

## Decision

- The Company OS API uses the neutral Broker control contract to describe
  references, issue exact short-lived leases and revoke them.
- A separately authenticated execution contract owns redemption. Browsers and
  the Company OS API never receive its bearer authority or response material.
- The maintained adapter uses official Vault AppRole login and KV v2
  exact-version reads. AppRole values, Broker bearer authorities and private
  Vault coordinates are mounted from files; Vault client tokens remain in
  memory.
- Durable lease state stores only opaque bindings, lifecycle, expiry,
  authorization and attestation data. It does not store material, Vault paths,
  fields or target environment-variable names.
- A separate Broker-owned mode-0600 reference registry may store Vault
  coordinates and HMAC-digested management sessions, but never values or
  plaintext handoff tokens. Broker-owned forms implement the neutral
  create/rotate/suspend/revoke contract; KV writes use exact CAS versions.
- The Codex driver injects the redeemed value into the child-only allowlisted
  environment and does not persist it in driver state, results or observations.
- The Vault Broker is a fifth independently built, digest-addressed and
  attested release image.

The first staging adapter has one shared execution bearer for one Codex Agent
Node. It is not admitted for a multi-node production deployment until the
authority is per-node or mTLS-bound and consumer-scoped.

## Paperclip relationship

The generic lifecycle reference remains Paperclip tag `v2026.817.0`, commit
`213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`, MIT, specifically the files already
recorded in `docs/source-manifest.md` under “Paperclip grant and Secret
lifecycle behavior adoption.” No Paperclip code, schema, provider, runtime type
or UI is copied. Vault transport and redemption are Company OS extensions.

## Consequences

- Vault, another enterprise Broker or a local implementation can replace the
  maintained adapter behind the neutral port.
- Revocation and exact-version drift fail closed; availability cannot be
  recovered by storing a credential in Company OS.
- A local synthetic chain and local release-image build are verified. Real
  enterprise Vault, TLS, rotation and restart evidence remain a staging gate.

## References

- https://developer.hashicorp.com/vault/api-docs/auth/approle
- https://developer.hashicorp.com/vault/api-docs/secret/kv/kv-v2
- https://developer.hashicorp.com/vault/docs/concepts/response-wrapping
