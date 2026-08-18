# Company OS architecture

## Dependency model

```text
core <- ports <- application <- adapters
                        ^          ^
                        |          |
                 connector-sdk    web
```

- `core` owns organization, responsibility, work, event, and renderer-neutral
  office scene semantics.
- `ports` defines replaceable system boundaries using core types.
- `application` coordinates use cases and deterministic Demo behavior.
- `adapters` maps infrastructure and product-specific identity/runtime concerns.
- `connector-sdk` is a versioned provider-neutral edge contract.
- `web` is an independently built composition root and DOM renderer adapter.

`core`, `ports`, and `application` cannot import outward layers. A source scanner
also rejects host, transport, vendor, Web-framework, and browser vocabulary in
these layers.

## Port surface

| Port | Responsibility |
|---|---|
| `IdentityPort` | Resolve Company OS identity and authorize intent without exposing host tokens |
| `OrganizationPrincipalPort` | Load organizations and neutral principals |
| `EventDataStorePort` | Append/read company events and reset isolated fixture state |
| `GenericWorkPort` | Anti-corruption boundary to the single generic task/run substrate |
| `AgentExecutionPort` | Declare capabilities/health and submit, observe, pause, resume, cancel work |
| `ModelProviderPort` | Resolve a model policy to a referenced output without leaking vendor sessions |
| `DataConnectorPort` | Enforce data authorization and egress decisions |
| `ApprovalPublicationPort` | Publish exact high-risk requests and human decisions |
| `AuditEvidencePort` | Record evidence and project the first-class responsibility chain |
| `OfficeRendererPort` | Render a versioned office scene without owning organization logic |

## Connector contract

Every provider uses protocol `1.0` envelopes. Messages cover capabilities,
identity binding, health, task submission/progress, approval pause/resume,
evidence/result, cancellation, and runtime proof. Work requests include an
idempotency key and timeout. Runtime proof is short-lived and secret-free.

The control plane stores references/digests, not credentials, private vendor
sessions, or private reasoning. A high-risk approval binds exact action,
action digest, work, responsibility contract, executing agent, accountable
human, evidence references, and result reference.

Raft's current event kinds and `snake_case`/`schema_version` formats remain a
future serializer in a Raft-specific adapter; they are not core concepts.

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

Both profiles compose the same core/application:

| Profile | Default identity | Store | Execution plane |
|---|---|---|---|
| `managed-cloud` | `raft-identity` adapter | cloud event store | hybrid |
| `self-hosted` | enterprise/local OIDC adapter | local event store | local |

This is composition metadata only. Production adapters are intentionally absent
from phase one. Unified login never implies shared token audience or permission.

## Paperclip generic-work substrate

Paperclip runs as a separately versioned Headless/Core Service with its customer
UI disabled. `PaperclipGenericWorkAdapter` is the only code allowed to know its
REST paths and DTO shapes. It maps Company OS opaque IDs through an injected
resource map, validates every response, normalizes stable error codes, and
projects only sanitized run-event attributes.

The resource map is Company OS adapter state, not a Paperclip foreign key in
the domain. Local/self-hosted storage is tenant-partitioned, atomic, integrity
checked, and portable through a digest-bound backup. A future managed-cloud map
must satisfy the same contract.

Company-level WebSocket events are cache hints because the pinned upstream does
not replay them. Durable evidence and recovery use the heartbeat run-event
endpoint with `afterSeq`. Paperclip database tables, private server modules,
React types, sessions, credentials, raw payloads, and private reasoning never
cross the adapter boundary.

Paperclip remains canonical for generic Task/Goal/Run/Heartbeat/Budget/Artifact
state. Company OS remains canonical for accountable humans, responsibility,
data authorization, exact approvals, evidence, Agent Boss, and Office state.

## HTTP service boundary

`adapters/http` provides the independent service entry. The current endpoint is
explicitly `DEMO_FIXTURE`; it exposes bounded JSON actions, health/readiness,
stable public error codes, restrictive security headers, origin checks, request
size/time limits, and graceful shutdown. It does not claim to be a production
Agent or production identity service.

## Web and mount ownership

`web/index.html` is the standalone Vite entry. `mountCompanyOS` accepts only a
host-owned element, optional base path, and navigation callback. The host cannot
inject or own Company OS use cases. A future Raft Web adapter may call this
contract or link to the standalone domain.

## Pre-3D Office Compiler

`compileOfficeScene` converts organization structure into versioned modules and
entity states. `OfficeRendererPort` consumes this description. The current DOM
adapter is replaceable; no domain rule references DOM, images, camera, geometry,
Blender, GLB, or Three.js.

## Framework sources

- Vite standalone development/build and `index.html` entry:
  https://vite.dev/guide/ and https://vite.dev/guide/build
- TypeScript project/reference guidance considered for future package splits:
  https://www.typescriptlang.org/docs/handbook/project-references.html
- Node test runner used for focused tests:
  https://nodejs.org/api/test.html
