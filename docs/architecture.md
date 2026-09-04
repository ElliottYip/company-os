# Company OS architecture

## Dependency model

```text
core <- ports <- application <- adapters
                        ^          ^
                        |          |
                 connector-sdk    web
```

- `core` owns organization, responsibility, work, and event semantics.
- `ports` defines replaceable system boundaries using core types.
- `application` coordinates use cases and deterministic Demo behavior.
- `adapters` maps infrastructure and product-specific identity/runtime concerns.
- `connector-sdk` is a versioned provider-neutral edge contract.
- `web` is an independently built composition root and product UI adapter.

`core`, `ports`, and `application` cannot import outward layers. A source scanner
also rejects host, transport, vendor, Web-framework, and browser vocabulary in
these layers.

## Port surface

| Port | Responsibility |
|---|---|
| `IdentityPort` | Resolve Company OS identity and authorize intent without exposing host tokens |
| `OrganizationPrincipalPort` | Load organizations and neutral principals |
| `EventDataStorePort` | Append/read company events and reset isolated fixture state |
| `DurableControlPlaneStorePort` | Atomically commit event/outbox, checkpoint projections, and export/restore versioned backups |
| `GenericWorkPort` | Company OS-owned canonical work/run persistence and scheduling boundary |
| `AgentExecutionPort` | Declare capabilities/health and submit, observe, pause, resume, cancel work |
| `ModelProviderPort` | Inspect provider capabilities and health for route governance; inference belongs to the Agent Node |
| `DataConnectorPort` | Enforce data authorization and egress decisions |
| `ApprovalPublicationPort` | Publish exact high-risk requests and human decisions |
| `AuditEvidencePort` | Record evidence and project the first-class responsibility chain |
| `ResponsibilityContractPort` | Persist revisioned Agent-to-accountable-human contracts |

## Connector contract

Every provider uses protocol `1.0` envelopes. Messages cover capabilities,
identity binding, health, task submission/progress, approval pause/resume,
evidence/result, cancellation, and runtime proof. Work requests include an
idempotency key and timeout. Runtime proof is short-lived and secret-free.

The control plane stores references/digests, not credentials, private vendor
sessions, or private reasoning. A high-risk approval binds exact action,
action digest, work, responsibility contract, executing agent, accountable
human, evidence references, and result reference.

Model execution has one canonical owner: the customer-operated Agent Node.
Company OS selects and freezes the model route, fingerprints the installed
provider boundary and issues an opaque Broker grant, but never accepts a prompt
or calls inference through `ModelProviderPort`. See ADR 0028.

Raft's current event kinds and `snake_case`/`schema_version` formats remain a
future serializer in a Raft-specific adapter; they are not core concepts.

WorkAttempt is the durable execution truth. It freezes the responsibility
revision, accountable human, allowed actions, permissions, data contracts,
Connector and capability digest. Fencing tokens reject stale workers;
running/approval work whose external outcome is uncertain becomes
`OUTCOME_UNKNOWN` and requires evidence-backed reconciliation.

## Deterministic Demo runtime

The Demo runtime is an in-memory state machine:

```text
READY -> PLANNING -> SIMULATING_TOOL_ACTIVITY
      -> AWAITING_APPROVAL -> COMPLETED | REJECTED
```

Clock values, IDs, events, evidence, and result references are fixed. Reset
restores the byte-for-byte initial state. The runtime exposes no network,
filesystem, model, tool, credential, or production-data dependency. The Web
clearly labels every connector and actor as a fixture.

## Deployment profiles

The self-hosted profile persists new writes through an atomic control-plane
store: the domain event and every external publication are committed together,
while replayable projections advance with optimistic, monotonic checkpoints.
It reads the earlier `*.events.json` schema as a rollback-safe migration source,
leaves that source untouched, and creates `*.control-plane.json` on the first
new write. Managed-cloud composition rejects an event-only store: injected
storage must also implement atomic outbox, checkpoints, corruption-checked
backup and empty-target restore.

Both profiles compose the same core/application:

| Profile | Default identity | Store | Execution plane |
|---|---|---|---|
| `managed-cloud` | `raft-identity` adapter | injected durable cloud store | hybrid |
| `self-hosted` | enterprise/local OIDC adapter | local durable store | local |

This is composition metadata only. Production adapters are intentionally absent
from phase one. Unified login never implies shared token audience or permission.

## Company OS work system

Company OS is canonical for Task, Goal, Run, Heartbeat, Budget, Artifact,
organization, responsibility, data authorization, exact approval, evidence,
Agent Boss, and Office state. Replaceable store and scheduler adapters implement
Company OS ports; no peer product, external database schema, or vendor session
owns these records.

Paperclip-specific adapter experiments and compatibility fixtures were removed
from the product runtime under ADR 0008 and preserved only below
`research/paperclip`. Product type checking, tests, builds, service startup, and
deployment profiles do not include that directory. A dedicated independence
guard rejects any future Paperclip coupling in runtime roots or dependencies.

Formal dispatch is ordered deliberately: enterprise identity and tenant match →
organization and active responsibility contract → allowed action validation →
exact authorization receipt → Company OS dispatch-request event → idempotent
`GenericWorkPort` command. An infrastructure failure records only a stable code and
retryability; it cannot erase or redefine the Company OS responsibility fact.

## HTTP service boundary

`adapters/http` provides the independent service entry. `/api/demo` remains
explicitly `DEMO_FIXTURE`; versioned formal routes expose Agent Boss reads,
accountable work, exact approval and sanitized administration. The service has
bounded JSON, health/readiness, stable public error codes, restrictive security
headers, origin checks, request-size limits, and graceful shutdown. It does not
claim to be a production Agent or identity service.

## Web and mount ownership

`web/index.html` is the standalone Vite entry. `mountCompanyOS` accepts only a
host-owned element, optional base path, and navigation callback. The host cannot
inject or own Company OS use cases. A future Raft Web adapter may call this
contract or link to the standalone domain.

## Framework sources

- Vite standalone development/build and `index.html` entry:
  https://vite.dev/guide/ and https://vite.dev/guide/build
- TypeScript project/reference guidance considered for future package splits:
  https://www.typescriptlang.org/docs/handbook/project-references.html
- Node test runner used for focused tests:
  https://nodejs.org/api/test.html
