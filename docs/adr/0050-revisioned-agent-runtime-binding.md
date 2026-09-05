# ADR 0050: Revisioned Agent-to-Runtime binding

Status: Accepted  
Date: 2026-09-05

## Context

An Agent currently stores `runtimeConnectorId` directly in its organization
record. Formal Agent creation may select a registered Connector, while setup and
local draft creation may use `connector-unbound`. Profile editing deliberately
cannot change the field because Runtime authority must not be changed as ordinary
presentation metadata.

This leaves no supported path for the common sequence “create Agent now, register
or discover Runtime later, then bind them.” It also means a historical Work record
cannot identify which reviewed binding revision authorized its execution.

## Decision

Company OS owns a neutral, revisioned `AgentRuntimeBinding` domain record.

- Agent and Runtime may be created in either order.
- Bind, rebind and unbind are explicit authorized commands with an expected
  revision, human actor, reason, timestamp and server-derived Connector
  capability digest.
- The current `AgentDraft.runtimeConnectorId` remains as a materialized
  compatibility projection while existing Work and Connector code migrates.
  It is updated atomically in the same `organization.revised` event as the
  binding snapshot; it is never changed by Agent profile editing.
- Existing Agent records project to revision-zero bindings. `connector-unbound`
  becomes `UNBOUND`; an existing Connector reference becomes
  `BOUND_UNVERIFIED` with no invented capability digest.
- A newly bound Runtime is `BOUND_UNVERIFIED`. Existing lifecycle approval and
  readiness checks remain responsible for admitting execution.
- Bind/rebind/unbind fails closed for wrong tenant, missing authority, stale
  revision, disabled or unavailable Runtime, terminated Agent, and non-terminal
  Work. `OUTCOME_UNKNOWN` is non-terminal.
- The application derives capabilities and health from the installed execution
  port and derives the capability digest through `ConnectorRuntimeSecurityPort`.
  The browser cannot supply these facts.

The dependency direction remains:

`core <- ports <- application <- adapters/web`

No provider, transport, database or Web concept enters the binding domain.

## Alternatives considered

### Allow `runtimeConnectorId` in the existing profile form

Rejected. It provides no reviewed intent, capability snapshot, conflict fencing,
active-Work protection or stable audit record.

### Require Runtime registration before Agent creation

Rejected. It imposes an artificial ordering on inventory work and still leaves
rebind and Runtime retirement unresolved.

### Remove `runtimeConnectorId` immediately

Rejected for the Alpha increment. Work scheduling, lifecycle approval and
existing Connector tests currently consume it. The materialized projection keeps
one observable version while consumers migrate to an explicit binding revision.

### Put binding semantics in a Connector adapter

Rejected. Agent-to-Runtime authority is Company OS governance, not a vendor or
transport concern.

## Consequences

- Organization events carry both the current structure and the binding snapshot,
  so event replay cannot expose conflicting current Runtime facts.
- New Work authority can add the binding revision without breaking existing
  records.
- The Web can offer the same reviewed binding flow from Agent and Runtime detail.
- Runtime capability changes can later move a binding back to an unverified state
  without rewriting history.
- Until every Work consumer uses binding revisions directly, the compatibility
  projection must be retained and covered by a consistency test.

