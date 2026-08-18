# ADR 0001: Independent hexagonal boundaries

Status: Accepted  
Date: 2026-08-18

## Decision

Company OS owns framework-neutral `core`, `ports`, and `application` layers.
Vendor, transport, identity, persistence, and presentation concerns enter only
through outward adapters. Dependencies point inward.

The initial port set includes identity, organization/principal, event/data
store, agent execution, model provider, data connector/egress, approval
publication, audit/evidence, and office renderer/assets.

## Consequences

- Raft Agent is one equal connector; Raft Identity is one default adapter.
- Raft Web can mount/link Company OS but cannot contain its business logic.
- Managed-cloud and self-hosted compose adapters over shared business code.
- A boundary scanner rejects forbidden imports and vocabulary leakage.

