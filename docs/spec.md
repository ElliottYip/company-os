# Company OS phase-one specification

## Assumptions approved by the delegated brief

1. Phase one is a browser control-plane shell plus framework-neutral TypeScript
   domain/application/port contracts, not a complete Company OS migration.
2. The Web shell uses Vite with vanilla TypeScript to keep the initial runtime
   dependency surface small; a UI framework can be added later at the Web edge.
3. All displayed connector and status data is deterministic fixture data and is
   visibly labelled as a demo. No connector invokes a real model or agent.
4. Raft Identity is represented by a default adapter contract only. No real
   session, credential, or production identity data is used.
5. The three fish PNGs and a narrow, adapted subset of visual tokens/button
   rules are the only Raft visual materials copied in phase one.
6. The source repository's top-level Apache-2.0 license is retained alongside
   copied material. Because selected visual files are uncommitted in the source
   worktree, their exact status and hashes must remain documented.
7. A deterministic Demo Mode belongs in the foundation; real paid agents and
   production identity/data remain outside this scaffold delivery.

## Objective

Create an independently buildable Company OS foundation that can orchestrate
heterogeneous agents through equal connectors, keep identity and infrastructure
replaceable behind ports, support managed-cloud and self-hosted deployment
profiles from one business codebase, and optionally mount inside Raft Web
without transferring business ownership to the host.

Phase-one success means reviewers can run one verification command, inspect the
dependency graph, start the standalone Web shell, and see an explicitly labelled
fixture dashboard whose behavior is backed by focused tests.

## Tech stack

- Node.js 24-compatible ESM
- TypeScript 6 strict mode
- Vite 8 standalone Web entry
- Node built-in test runner for small deterministic tests
- Plain CSS using Company OS-owned semantic tokens derived from the audited
  Raft visual source

The build follows Vite's documented `index.html` application entry and `vite
build` production path. TypeScript project references are intentionally deferred
until packages require separate publishing; phase one enforces layering with a
dedicated import scanner and strict compilation.

## Commands

- Install: `npm install`
- Standalone Web: `npm run dev`
- Unit tests: `npm test`
- Type check: `npm run typecheck`
- Dependency guard: `npm run check:boundaries`
- Production build: `npm run build`
- Full phase-one gate: `npm run verify`

## Project structure

- `core/`: domain values and entities; zero vendor/framework dependencies.
- `ports/`: replaceable interfaces for identity, organization/principals,
  event/data storage, agent execution, model providers, data connectors,
  approval publication, and audit/evidence.
- `application/`: use cases coordinating ports and returning presentation-safe
  control-plane read models.
- `adapters/`: replaceable edge implementations, including default Raft
  Identity mapping and in-memory demo infrastructure.
- `connector-sdk/`: stable connector envelope, validation, and host-neutral
  registration contract for every agent provider.
- `web/`: standalone Vite app, Company OS-owned tokens/components/assets, and
  an optional mount/host adapter surface.
- `tests/`: focused unit and dependency-boundary tests.
- `docs/`: architecture, source provenance, directory map, deployment profiles,
  and migration plan.

## Code style

Contracts use explicit input/output types and discriminated unions:

```ts
export type ExecutionResult =
  | { readonly type: "accepted"; readonly executionId: string }
  | { readonly type: "rejected"; readonly reason: string };

export interface AgentExecutionPort {
  execute(request: AgentExecutionRequest): Promise<ExecutionResult>;
}
```

External inputs are validated once at their boundary. Domain and application
code trust typed internal values. Errors use stable `code` plus human-readable
`message` fields rather than adapter-specific exceptions.

## Testing strategy

- Small unit tests cover connector envelope validation, snapshot orchestration,
  default identity mapping, and deployment-profile selection.
- Boundary tests scan imports and forbidden terms in inward layers.
- The Web build is the integration proof for the standalone entry and owned
  assets. No browser E2E or external service is required in phase one.
- All tests are deterministic and use fakes/fixtures only.

## Boundaries

Always:

- Keep domain and application dependencies pointing inward.
- Label fixtures and demos in both code and UI.
- Validate connector and identity inputs at adapter boundaries.
- Keep copied visual provenance and hashes current.
- Run `npm run verify` after implementation changes.

Ask first:

- Identity responsibility or authorization-semantics changes.
- Schema/migration choices tied to a production datastore.
- Real credentials, production data, paid APIs, or outbound publication.
- A new framework/runtime dependency that materially changes deployment.

Never:

- Import source-repository code directly.
- Put Company OS business logic in Raft Web.
- Depend inward layers on Raft Agent, Buzz/Raft UI, NIP-07, Nostr kinds, or a
  specific relay.
- Treat demo connector records as real agents.

## Success criteria

1. All eight required top-level product directories exist.
2. Four replaceable port families are exported and used by an application use
   case without vendor-specific types.
3. Raft Identity exists only as a default edge adapter behind `IdentityPort`.
4. The Web app builds and starts independently, while exporting an optional host
   mount adapter that owns no domain logic.
5. Visual source files are copied rather than imported, licensed, hashed, and
   documented with committed/uncommitted source status.
6. `npm run verify` passes tests, boundary checks, strict type checking, and a
   production Web build.
7. Managed-cloud/self-hosted profiles select adapters without branching the
   domain or application code.
8. Architecture, directories, source manifest, and incremental migration plan
   are delivered in `docs/`.
9. Demo contracts model deterministic task, approval, evidence, responsibility,
   and reset behavior without external side effects.

## Open questions deferred beyond phase one

- Production persistence technology and event consistency model.
- Organization/tenant authorization rules and approval quorum semantics.
- Connector transport negotiation, remote attestation, and credential exchange.
- Self-hosted packaging target (containers, single binary, or orchestrator).
