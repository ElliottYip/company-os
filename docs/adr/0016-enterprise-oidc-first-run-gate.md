# ADR 0016: Enterprise OIDC gates every formal first run

Status: Superseded by ADR 0018
Date: 2026-08-24

## Context

Company OS assigns permissions, approvals, evidence, and organizational
responsibility to real people. A convenient implicit local administrator would
create a second identity authority and an unsafe handoff problem. The product
owner therefore requires enterprise OIDC before any formal company operation.

Paperclip at pinned commit
`213dabab4f8e1f3bb1803a2924c0fea1289fcd4c` demonstrates a useful separation:
the process can start while deployment checks report explicit `fail` states
and repair hints. Its page implementation and English error messages are not
copied; Paperclip remains a research reference and runtime-independent.

## Decision

- Formal Company OS requires a configured enterprise OIDC adapter from first
  launch. There is no implicit local board, fixture admin, or password fallback.
- An unconfigured instance may expose only a sanitized access-readiness API
  and a restricted Web shell with identity settings and diagnostics.
- Company data, company creation, humans, Agents, execution, approvals,
  evidence, and governance remain unavailable until configuration and a valid
  OIDC session both succeed.
- The readiness contract returns stable codes and structured parameters; UI
  copy is localized separately and is never persisted as domain state.
- Issuer/client metadata and session secrets remain server-side. Secret values
  never enter browser payloads, events, logs, or projections.
- Demo is a separate, clearly labelled fixture path and cannot mint or promote
  a formal identity.

## Required state sequence

`BLOCKED` (provider incomplete) → `AUTHENTICATION_REQUIRED` (provider ready) →
`READY` (valid session and authorization context).

Any provider outage or invalid/expired session fails closed. Returning to a
restricted shell must not reuse previously loaded company projections.

## Consequences

- Self-hosted installation needs enterprise identity coordination before the
  formal product can be used.
- The service remains operable enough to diagnose configuration without
  weakening responsibility semantics.
- OIDC stays in an adapter; core/application continue to depend only on the
  replaceable `IdentityPort` contract.
