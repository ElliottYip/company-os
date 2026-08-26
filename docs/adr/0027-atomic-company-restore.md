# ADR 0027: restore a portable company through one global atomic command

Status: accepted, 2026-08-25.

## Context

The original Web control posted a backup to a company-scoped import route. A
normal company creation also creates its directory and membership, while first
setup appends an organization event. PostgreSQL restore correctly refuses to
overwrite non-empty state, so no customer journey could produce a legitimate
target for that route. A mocked HTTP response concealed the broken end-to-end
contract.

Restore also crosses an identity and responsibility boundary. Automatically
mapping the current login to a different human from the backup would change who
is accountable for existing Work and approvals.

## Decision

Company OS exposes a read-only `POST /api/v1/companies/restore/inspection`
preflight and `POST /api/v1/companies/restore` as global,
instance-administrator commands. Preflight verifies the same formal-state,
identity, work, approval, outbox, organization and target-ID constraints without
allocating IDs or writing state. The Web presents its authoritative summary and
requires explicit confirmation. One PostgreSQL transaction creates the company,
owner membership and grants, then restores the verified event, delivered-outbox
and checkpoint state. Any failure rolls back the entire transaction.

The backup must be formal production state, include a valid organization, have
no pending outbox publication, pending approval, or unresolved Work Attempt,
and use a company ID absent from the target. The authenticated user must already
be a human in the restored organization. Identity rebinding is a separate,
explicit future ceremony and is never inferred by restore.

The no-company bootstrap and Settings surfaces both use the same global API.
The previous company-scoped import route is removed rather than retained as a
misleading compatibility alias.

## Consequences

- A portable backup can now be restored through an actual product journey.
- File selection cannot trigger restore directly; inspection and confirmation
  are separate from the atomic mutation.
- Failure cannot leave an unusable directory shell.
- Restoring in-flight work is deliberately refused until a separately designed
  quiesce/failover protocol can prove execution ownership.
- Cross-IdP migration needs an explicit, reviewed identity-rebinding design; it
  cannot be smuggled into data portability.
- Focused application, HTTP, Web-client, boundary, and opt-in live PostgreSQL
  tests own the contract.
