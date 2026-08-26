# ADR 0031: Accountability export is distinct from disaster-recovery backup

## Status

Accepted, 2026-08-26.

## Context

The existing company backup contains durable events, outbox delivery state, and
projection checkpoints. Sending that restore format to an auditor would expose
more operational data than a responsibility review requires.

Paperclip's mature separation between operator lifecycle surfaces and data
portability informed this boundary. Company OS additionally must answer who
initiated work, which accountable human owned it, which Agent acted, which
permissions and data grants were used, who approved risk, and which evidence
supports the result. Paperclip remains an engineering reference, not a runtime,
schema, or type dependency.

## Decision

Company OS owns a separate `COMPANY_OS_ACCOUNTABILITY_EXPORT` package and a
tenant-bound `POST /api/v1/companies/{companyId}/accountability-exports`
command.

- The command accepts only a portable idempotency key and bounded purpose code.
- Retention and export policy references are operator configuration injected by
  the server.
- The package includes exact approvals, decisions, digest evidence metadata,
  and responsibility projections.
- Formal responsibility projection joins the canonical durable Work with its
  matching Attempt authority snapshot; no export-only duplicate schema is
  introduced. Legacy neutral events with an explicit responsibility context
  remain readable.
- It excludes raw event payloads, artifact bytes, enterprise records,
  credentials, prompts, reasoning, and vendor-private sessions.
- A metadata-only completion event makes replay auditable. Replay recomputes
  the package from the pre-export event sequence and verifies digest and counts.
- Demo identities and cross-tenant requests fail closed.
- The Web validates schema, tenant, references, forbidden fields, and SHA-256
  before offering the JSON download.

The disaster-recovery backup remains unchanged and remains the only input to
atomic company restore.

## Consequences

Auditors receive the minimum responsibility record rather than a database-like
backup. Operators map opaque policy references to their retention, legal-hold,
and external-handling procedures. Company OS does not upload packages or infer
an external destination.

The no-route-interception release browser gate verifies this decision against
real PostgreSQL and OIDC, including package download, SHA-256 validation, API
restart, and identical idempotent replay.
