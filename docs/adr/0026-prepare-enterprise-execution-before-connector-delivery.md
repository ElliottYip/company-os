# ADR 0026: Prepare enterprise execution before Connector delivery

Status: Accepted
Date: 2026-08-25

## Context

Company OS already had independently tested boundaries for governed data
access, opaque Secret Broker leases and Agent Connector delivery. They were not
one execution transaction. A Work command could be delivered before its data
decision or Broker grant existed, leaving integration code to invent ordering
and recovery semantics.

The control plane must coordinate authorization without receiving enterprise
records, credentials, provider sessions or private reasoning. A failure in a
customer-owned Data Node or Secret Broker must not result in an under-authorized
Agent invocation.

## Decision

- Formal Work dispatch may carry a bounded, secret-free execution-preparation
  plan. Company, Work, Agent, execution-node consumer and request time are
  derived by the server; the browser cannot override them.
- The Work Attempt authority snapshot binds the exact data authorization
  contract IDs before the durable Connector command is created.
- Company OS records `work-execution.preparation-requested`, evaluates every
  data request through `AccessGovernedData`, and issues only opaque, short-lived
  Broker grants through `IssueSecretLease`.
- `WORK_EXECUTION` leases are accepted only when the active reference is an
  `AGENT_CONNECTOR` reference bound to the exact Connector consumer.
- Only contract IDs, data/evidence references, lease IDs and digests may enter
  events or the Connector request. Enterprise records and credential material
  remain in their owner nodes.
- `DeliverConnectorCommands` fails closed with
  `WORK_EXECUTION_NOT_PREPARED` while a preparation marker is missing. The
  outbox command remains pending for redrive; it is never acknowledged or sent.
- Data requests, lease issuance and final preparation markers are replay-safe.
  Reusing a Work Attempt and reference with different lease parameters is an
  idempotency conflict.
- A crash-interrupted preparation is projected as `PENDING`. Company OS does
  not let a supervisor impersonate the original human. The exact Work
  initiator must return through a formal session and invoke the narrow
  preparation-retry command; all data and Broker authorization checks then run
  again before delivery.

## Alternatives considered

### Let each Agent Connector call Data Nodes and Brokers without control-plane orchestration

Rejected because Company OS could not prove which authorization and grant were
in force before execution, and every Connector would invent different retry and
audit behavior.

### Put credentials or enterprise records in the Work request

Rejected because it would turn the control plane, event journal and outbox into
a data and credential exfiltration path.

### Deliver first and attach authorization later

Rejected because a fast or malicious execution node could act before the
authorization chain existed.

## Consequences

- A formal Work can now cross Data Node, Secret Broker and Agent Node boundaries
  in a deterministic order while preserving independent ownership.
- Existing Work requests without an execution-preparation plan remain protocol
  compatible.
- Customer acceptance against actual enterprise systems remains required; the
  maintained reference nodes and test doubles are not represented as real
  enterprise Agents, Brokers or data sources.
- Dynamic data operations requested during a long-running execution still need
  a separate runtime authorization exchange; this ADR covers pre-execution
  grants only.
- Fully unattended preparation recovery would require a separately approved
  delegated-authority contract. It is intentionally not inferred from a human
  login or an old authorization receipt.
