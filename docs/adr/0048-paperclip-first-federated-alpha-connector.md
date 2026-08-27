# ADR 0048: Use a pinned Paperclip adapter for the first Federated Alpha acceptance

Status: Accepted for private Alpha; live sandbox acceptance pending

## Context

ANC needs one real external Agent-platform integration without making an
external runtime a domain dependency or blocking the public fixture Demo.
Slack is a good future Shared/Observed source, but its Events API represents a
collaboration surface rather than a company Agent runtime. The current QM
interface is not yet backed by a reviewed public contract.

Paperclip publishes Agent, Issue and heartbeat-run APIs that match the
Federated Runtime boundary. Company OS already holds a complete audit copy at
tag `v2026.817.0`, commit
`213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`. The relevant official sources are:

- https://github.com/paperclipai/paperclip/blob/v2026.817.0/docs/api/agents.md
- https://github.com/paperclipai/paperclip/blob/v2026.817.0/doc/SPEC-implementation.md#104-tasks-issues
- https://github.com/paperclipai/paperclip/blob/v2026.817.0/docs/start/core-concepts.md

## Decision

The first private Alpha connector targets that exact Paperclip release and is
implemented only in `adapters/connectors`. `core`, `ports`, and `application`
remain provider-neutral.

The connector:

1. reads `GET /api/companies/{companyId}/agents` and the bounded company Issue
   list over HTTPS, with loopback HTTP allowed only for local acceptance;
2. receives the board/API credential through a file-injected outer-adapter
   closure and never returns or persists it;
3. imports one explicit Federated Runtime record plus only externally mapped
   Agents, avoiding invented human accountability;
4. imports bounded Issue title/status/priority and source references, not
   descriptions, run logs, session IDs, adapter configuration or reasoning;
5. records unmapped/unsupported objects as bounded anomalies and does not
   falsely attribute them;
6. is triggered by a private formal API request from an OIDC-authenticated,
   authorized human; it is unavailable in the public Demo runtime;
7. uses source timestamps as revisions so a partial batch can be retried
   idempotently.

The capability declaration intentionally omits `USAGE`. Paperclip's official
`costs/by-agent` response is an aggregate snapshot. Importing it as a sequence
of usage events would double-count on replay. Usage remains unsupported until
ANC adds an absolute-snapshot model or the pinned external API exposes stable,
event-level cost records.

## Consequences

- Alpha can connect to a real federated Agent runtime without routing its work
  through ANC.
- External IDs are deployment-bound to existing ANC Agent and accountable-human
  IDs before data is imported.
- A sync batch is bounded to 200 inventory records, 200 Work records and 200
  anomalies. Per-record writes are idempotent; the batch is not represented as
  an atomic external transaction.
- Paperclip remains an optional adapter and carries no compatibility promise
  beyond the pinned version.
- Production use remains blocked by live sandbox evidence, credential rotation,
  target TLS evidence, upstream-version drift admission and the existing
  upstream security findings recorded in `docs/upstreams/paperclip.md`.

## Rejected alternatives

- Treat aggregate cost snapshots as usage events. Rejected because retries
  would inflate spend.
- Read task descriptions, logs or runtime sessions. Rejected because the Alpha
  only needs bounded portfolio projection and source links.
- Put Paperclip schemas in `core` or `application`. Rejected because it would
  violate the independent control-plane boundary.
- Enable the connector inside the anonymous public Demo. Rejected because real
  credentials and external data belong only in the private formal Alpha.
