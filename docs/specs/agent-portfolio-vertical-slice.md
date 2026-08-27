# Spec: ANC Agent Portfolio vertical slice and exhibition Demo

Status: Approved from product-owner brief  
Date: 2026-08-27  
Target release: next immutable candidate after `v0.1.0-rc.5` (default RC6)

## Assumptions fixed for this slice

1. Company OS remains the repository/deployment name; ANC names the product
   control layer. A repository-wide rename is out of scope.
2. Existing RC4/RC5 artifacts and prepare-only evidence are immutable inputs.
3. Provider and external-platform names appear only in fixtures, adapters, and
   Connector packages; inward layers use neutral references.
4. Public Demo isolation is server-owned and session-scoped. Browser-only IDs
   are not accepted as a tenant boundary.
5. Demo records have a bounded lifetime and deterministic reset. Exact TTL and
   storage adapter are deployment configuration, not domain policy.
6. Local implementation and verification precede any server, DNS, TLS, or
   release publication mutation.

## Objective

Deliver a running end-to-end portfolio in which a visitor or enterprise user
can distinguish and manage Personal, Shared, and Federated Agents at truthful
management depths. Preserve Governed Work, responsibility, approval, evidence,
durability, security, and deployment behavior.

The exhibition visitor can complete the charter's three-minute Demo without an
account or external service. Formal users continue through OIDC and cannot use a
Demo identity to access administration.

## Commands

- Install: `npm install`
- Develop: `npm run dev`
- Focused tests: `node --experimental-strip-types --test tests/<file>.test.ts`
- Unit/integration: `npm test`
- Browser E2E: `npm run test:e2e`
- Type check: `npm run typecheck`
- Boundary check: `npm run check:boundaries`
- Build: `npm run build`
- Full admission: `npm run verify`

## Project structure

- `core/`: neutral portfolio, Work-source, commercial-status, and validation
  types; no vendor names or I/O.
- `ports/`: storage and inbound/outbound contracts using core types only.
- `application/`: idempotent registration, synchronization, renewal, Demo, and
  portfolio projection use cases.
- `adapters/`: HTTP validation, persistence, identity, fixture, and Connector
  implementations.
- `connector-sdk/`: public neutral envelopes and capability conformance.
- `web/`: existing owned responsive UI and bilingual copy.
- `tests/`: small domain tests, medium API/persistence tests, and critical E2E.
- `docs/`: charter, ADR, API, migration, release, and Demo runbook evidence.

## Code style

Strict TypeScript, ESM, named exports, immutable inputs, stable error codes, and
adapter-boundary validation. Neutral core example:

```ts
export interface AgentPortfolioRecord {
  readonly agentClass: "PERSONAL" | "SHARED" | "FEDERATED_RUNTIME";
  readonly managementDepth: "INVENTORY" | "OBSERVED" | "GOVERNED" | "FEDERATED";
  readonly executionOwner: "HUMAN_ENDPOINT" | "ANC_CONNECTOR" | "EXTERNAL_PLATFORM";
}
```

## Functional contracts

### Agent Portfolio

An Agent record must include company, stable Agent ID, class, display name,
accountable human or explicit gap, provider/runtime references, external
identity/source reference when present, management depth, execution owner,
visibility, permission summary, credential/subscription state, lifecycle,
Connector health, and last synchronization time where applicable.

Validation rejects combinations that overstate control, including Inventory
Agents owned by an ANC execution Connector without governed capability and
Federated Agents that claim ANC execution ownership.

### Connector capabilities

Capabilities separately declare readable data and enforceable controls.
Registration can be inventory-only, usage-only, observed, governed execution,
or federated sync. Existing v1 full-execution connectors remain accepted through
a compatibility mapping.

### Work

- Observed registration uses company + source + external Work ID as its
  idempotency identity. A replay returns the same Work; a conflicting payload
  fails with a stable conflict code.
- Governed creation continues through the existing authenticated responsibility
  contract and execution preparation path.
- Federated sync upserts a bounded source snapshot with monotonic source
  revision/cursor and records artifacts, evidence references, approval events,
  usage, anomalies, and return links without dispatch.
- Private Personal Agent task content has no registration endpoint in this
  slice.

### Usage, subscriptions, credentials, and renewals

Usage import is idempotent and allocates by employee, Agent, department,
provider reference, and billing period. Subscription records cover seat,
included quota, current status, renewal date, and cost. Credential-reference
records cover reference ID, status, expiry, last verification, and policy state
only. Renewal requests require requester, accountable owner, target reference,
reason, status, and any real approval binding.

### Demo Session

`Explore a live demo company` creates a cryptographically opaque session and a
server-side isolated fixture namespace. The cookie is secure in deployed
profiles and does not encode company authority. Demo routes resolve company ID
from the session; request bodies cannot choose a tenant.

Coral Labs contains three Personal Agents, four Shared Agents, at least one
Observed Work item, one Governed high-risk flow, and one deterministic
Federated workspace/run. Every external source and platform is labelled as a
reference fixture. Reset revokes the current generation and creates pristine
state for the same visitor only.

Formal middleware rejects Demo identities. Demo routing cannot compose formal
Secret, data, Connector execution, restore, archive, or administration services.

## Testing strategy

- Small tests validate type combinations, privacy minimization, idempotency,
  monotonic sync, renewal transitions, and capability truthfulness.
- Medium tests cover event-backed/PostgreSQL migration compatibility, HTTP
  boundary validation, tenant isolation, reset, and formal/Demo route denial.
- E2E covers the complete three-minute loop in Chinese and English at desktop
  and tablet widths, plus two concurrent visitors proving no data crossover.
- Existing governed execution, OIDC, backup/restore, release, boundary, Secret,
  build, and performance admissions must not regress.

## Boundaries

### Always

- Preserve dependency direction and existing governed semantics.
- Validate external input at adapters/SDK boundaries.
- Label fixture/reference data in API and UI.
- Record only opaque Secret/Token references and bounded external summaries.
- Add tests before behavioral implementation and verify every increment.

### Require separate authorization

- Publishing a release/tag/image, modifying a remote server, starting a formal
  runtime, initializing real OIDC/Vault/PostgreSQL data, or changing DNS/TLS.
- Using real external credentials, production data, or paid APIs.

### Never

- Delete or overwrite RC4/RC5 or prepare-only evidence.
- Read Personal Agent conversations, files, sessions, or reasoning by default.
- Present fixture, Observed, or Federated data as ANC-governed execution.
- Put provider/protocol concepts in `core`, `ports`, or `application`.
- Make real Slack-like, model-provider, or federated Connector acceptance a
  blocker for this slice.

## Ordered implementation tasks

- [ ] Add neutral Agent Portfolio and capability contracts.
  - Accept: all three classes and four management depths validate; invalid
    control claims fail closed.
  - Verify: focused core/SDK tests, typecheck, boundary check.
- [ ] Add additive persistence and projections.
  - Accept: old Agents/Connectors/Work migrate without loss; RC5 backups remain
    inspectable.
  - Verify: migration, event replay, backup/restore compatibility tests.
- [ ] Add Observed Work registration and Federated sync.
  - Accept: idempotent registration, monotonic sync, bounded references, no
    dispatch.
  - Verify: application, HTTP, event/outbox, and tenant tests.
- [ ] Add subscription, credential status, usage allocation, and renewal.
  - Accept: no Secret material; renewal lifecycle and real approval linkage are
    explicit.
  - Verify: domain/application/API/projection tests.
- [ ] Add isolated deterministic Demo Sessions.
  - Accept: concurrent sessions do not cross; reset and recovery are scoped;
    formal routes reject Demo identity.
  - Verify: integration and concurrency tests.
- [ ] Adjust existing Web pages.
  - Accept: Portfolio Dashboard, Agents, Work, Approvals, Governance, and Usage
    display source, management depth, fixture status, and safe return links.
  - Verify: component tests, interaction checks, browser E2E, tablet viewport.
- [ ] Prepare release and exhibition operations.
  - Accept: next immutable RC artifacts, Hong Kong Demo Profile candidate,
    migration preflight, health/recovery and on-site runbook exist without
    altering RC4/RC5 evidence.
  - Verify: full `npm run verify` plus release/deployment admissions.

## Success criteria

All completion criteria in the product-owner brief are executable tests or
documented release gates. In particular: all Agent classes register; management
depth is visible and truthful; Personal privacy is minimized; Shared Work can
be Observed or Governed; Federated sync does not execute through ANC; identity,
permission, credential status, subscription, renewal, usage, cost, Work,
approval, evidence, and responsibility project together; the public Demo is
isolated, resettable, bilingual, responsive, deterministic, and formally
separated; and the complete repository admission passes.

