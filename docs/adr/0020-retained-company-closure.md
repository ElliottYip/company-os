# ADR 0020: Retained company closure

Status: Accepted
Date: 2026-08-25

## Context

Closing a company is not ordinary record deletion. Company OS may hold the
responsibility chain for work performed by Agents and approved by humans. A
local delete button could remove evidence required for customer recovery,
contractual retention, legal hold, or incident investigation. Conversely,
leaving memberships and Connector delivery active after a customer exit would
continue granting authority to a company that is meant to be closed.

## Decision

Company closure is a formal, irreversible transition from `active` to
`archived`; it is not physical deletion and it cannot be performed in Demo.
The active Owner must:

1. export a fresh, tenant-bound Company OS backup;
2. provide that exact backup digest, a stable retention-policy identifier and
   a bounded human reason;
3. have no pending approval, non-terminal/unknown WorkAttempt, or pending
   Connector outbox publication.

The service verifies the export digest against current durable state. One
PostgreSQL transaction then locks the company and event tail, rechecks active
Owner authority and pending outbox state, archives the company and all
memberships, revokes unaccepted invitations, and appends
`company.lifecycle.archived`. Domain events, evidence references, permission
history and accepted identity records remain retained. Archived companies are
not returned by the ordinary company directory and cannot be opened through an
active membership.

Restoration is an administrator-controlled recovery operation into a separate
empty company boundary. It is not a self-service “undo close” toggle. Physical
erasure, legal hold release and retention expiry belong to a future policy and
operator workflow; they may not bypass the immutable closure evidence.

## Alternatives considered

### Delete company and cascade all records

Rejected because foreign-key success is not evidence-policy correctness. It
would erase responsibility and approval history and make accidental closure
unrecoverable.

### Mark only the company row archived

Rejected because active memberships, invitations or pending Connector delivery
could remain usable while the UI claims the company is closed.

### Accept any syntactically valid backup digest

Rejected because the customer could unknowingly close against a stale export.
The server verifies the digest against a newly projected durable backup and the
database event sequence provides a second concurrency fence.

## Consequences

- The Web requires a fresh backup file, exact company-name confirmation and a
  reason before submitting the closure command.
- A closure race returns a stable conflict code; the user must export again.
- The operator configures `COMPANY_OS_RETENTION_POLICY_ID` (default
  `standard-retention`) as a contract reference, not a hard-coded deletion
  duration. The sanitized identifier is visible in Settings, while the service
  rejects any browser-supplied value that differs from operator configuration.
- Operators can recover retained data without silently restoring old access.
- A future retention/erasure implementation needs a separate ADR and must
  account for legal hold, customer policy and immutable responsibility proof.
