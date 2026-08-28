# ADR 0046: Model ANC as a multi-layer Agent Portfolio governance system

## Status

Accepted

## Date

2026-08-27

## Context

The existing Company OS implementation is strongest when ANC owns Governed
Work: it binds a real human, responsibility contract, permissions, data,
high-risk approval, evidence, result, usage, durable events, and Connector
delivery. That model must remain.

Enterprise AI is broader than ANC-dispatched Work. Employees use Personal
Agents; teams use shared channel Agents for both informal and governed work;
company-level platforms own their own workspaces, sessions, sandboxes, files,
and runs. Treating all three as locally executed subordinate Agents either
collects data ANC should not see or claims controls that external systems have
not granted.

The deployed RC4/RC5 infrastructure, release evidence, OIDC, Secret broker,
PostgreSQL, Agent/Data nodes, backup/restore, upgrade, and rollback contracts
are valid and expensive to recreate. The product model can change before a
formal production first start without replacing those foundations.

## Decision

ANC will maintain one neutral Agent Portfolio with three Agent classes:
`PERSONAL`, `SHARED`, and `FEDERATED_RUNTIME`.

Each Agent independently declares:

- management depth: `INVENTORY`, `OBSERVED`, `GOVERNED`, or `FEDERATED`;
- execution ownership: `HUMAN_ENDPOINT`, `ANC_CONNECTOR`, or
  `EXTERNAL_PLATFORM`;
- visibility and Connector capability facts;
- provider/runtime and external identity references;
- accountable human and lifecycle state.

Work becomes a cross-source projection with `OBSERVED`, `GOVERNED`, and
`FEDERATED` modes. Existing governed dispatch remains the only path that may
claim ANC-enforced authority, pause/resume, exact approval, and a complete
responsibility chain. Observed registration and Federated synchronization are
idempotent inbound contracts and do not invoke an execution port.

Connector capability declarations are split into data capabilities and control
capabilities. Full execution operations are no longer prerequisites for an
Inventory, Observed, usage-only, or Federated Connector. Runtime health remains
separate from saved catalog status.

Credential records contain an opaque reference plus status, expiry, and policy
metadata; no credential material. Subscription and renewal records are
first-class portfolio objects rather than inferred from request-level usage.

The public Demo runs through an isolated temporary Demo Session boundary. It
uses deterministic `DEMO_FIXTURE` events and cannot reach the formal OIDC,
administration, Secret redemption, data access, or production execution paths.

## Retained implementation

The following remain canonical and are extended rather than replaced:

- company, department, human, Agent, membership, and OIDC boundaries;
- accountable human and responsibility contracts;
- Goal, Project, Work, Attempt, Approval, Evidence, and Result;
- Event Store, Projection, Outbox, idempotency, and audit exports;
- Connector SDK and HTTP Agent/Data/Secret nodes;
- model, data, Secret-reference, budget, backup, restore, deployment, upgrade,
  and rollback governance;
- owned Web layout, interaction patterns, design tokens, and i18n.

## Alternatives considered

### Route every task through ANC

Rejected. It would replace native collaboration and federated runtime behavior,
over-collect Personal Agent activity, and make low-risk observed collaboration
unnecessarily dependent on ANC availability.

### Treat external platforms as Agent execution Connectors only

Rejected. A company Agent platform owns more than one submit/observe stream and
must synchronize directories, workspaces, runs, artifacts, approvals, and
lifecycle without surrendering execution ownership.

### Build separate Personal, Shared, and Federated products

Rejected. Identity, ownership, permissions, usage, cost, subscriptions,
lifecycle, risk, and responsibility require one enterprise system of record.
Separate products would duplicate policy and create conflicting truth.

### Rewrite Company OS around the new taxonomy

Rejected. The existing governed execution and operational foundations already
satisfy the hardest safety and durability requirements. Additive evolution is
safer and preserves release evidence.

## Consequences

- Existing Agent and Work schemas require additive versioned migration.
- Existing full-execution Connector registrations map to `GOVERNED`
  capability without losing behavior.
- UI labels must state actual management depth and fixture provenance.
- Personal Agent tasks remain absent unless a future explicit, policy-approved
  observed contract is added.
- A Federated source may provide incomplete responsibility evidence; ANC must
  display that incompleteness rather than synthesize it.
- The next release candidate must be uniquely numbered after existing RC5;
  release and server mutation remain separately authorized operations.

