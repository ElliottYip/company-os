# Spec: Product-grade functional integration

Status: approved for incremental implementation, 2026-08-24

## Assumptions

1. “Connect every function” means every control shown in the accepted Company
   OS customer interface either completes a real Company OS operation or shows
   a truthful, structured blocked state. Decorative or permanently disabled
   controls do not count as complete.
2. The first fully operable deployment target is the `self-hosted` profile.
   `managed-cloud` uses the same application code but still requires a real
   hosted identity and durable-store adapter before production deployment.
3. External Agent/model/data providers are connected through first-party
   neutral contracts and test connectors. This phase does not request vendor
   credentials, invoke paid APIs, or describe a fixture as a real Agent.
4. Demo Mode remains deterministic and isolated. Product functionality is
   proved separately through the formal HTTP/API composition.
5. Existing correct domain models, ports, tests, Web interaction work, visual
   assets, and Paperclip-independent boundaries remain in place.

## Objective

Turn the existing complete-looking Company OS interface into a complete
end-to-end product slice. A real human operator must be able to establish a
company, organize humans and Agents, create goals/projects/work, execute work
through a neutral Connector, decide high-risk actions, inspect evidence and
responsibility, administer model/data/tool/secret boundaries, inspect usage,
and manage product settings through versioned APIs and durable state.

Success means reloading the browser or restarting the self-hosted service does
not lose formal company state, every mutation is tenant- and identity-bound,
and all accepted journeys pass in unit, integration, API, and browser tests.

## Initial-state audit

This table records the gaps observed when the specification was approved. It
is not the live completion ledger; current evidence and remaining gates are in
`docs/production-maturity-baseline.md`.

| Capability | Current state | Required end state |
|---|---|---|
| Product boot | Web always constructs an in-memory Demo/local client | runtime selects Demo or a versioned formal HTTP client from explicit configuration |
| Service boot | service entry composes Demo only | self-hosted service composes durable formal application services; Demo stays a separate route |
| Identity | formal adapters exist, but no request-scoped Web login/session | authenticated request context with tenant/audience/role checks and logout/recovery behavior |
| Company onboarding | local in-memory organization replacement | validated create/open/list company APIs with durable state and optimistic revision |
| Departments | created once during setup | add, edit, archive, and validation of reporting/ownership impact |
| Humans | local add only | durable create/edit/archive with identity binding and responsibility-impact checks |
| Agents | local add only | durable create/edit/disable with Connector binding, accountable human, autonomy and capability checks |
| Responsibility contracts | domain/application registry exists | formal CRUD/versioning exposed through API and required before execution |
| Goals | inferred static row | durable create/edit/status/list with accountable owner and scope |
| Projects/workspaces | inferred static row | durable create/edit/archive/list with department membership and goal relationship |
| Tasks/work | one projected record | multi-work create/list/detail/filter/sort/status/cancel/retry-safe execution |
| Connector execution | ports and fixture connectors exist | formal Connector registry, health, dispatch, pause/resume/cancel/timeout/idempotency and evidence ingestion |
| Approval | formal decision API exists | list/detail/decision/note with exact immutable binding and complete history |
| Evidence/results | read projection exists | admitted evidence/result projection with digest, provenance, work, Agent and human links |
| Activity/inbox | derived from one work state | durable event timeline and responsibility/risk-scoped inbox projections |
| Models | read-only sanitized projection | create/update/disable route policies; credentials remain references only |
| Data authorization | read-only sanitized projection | create/update/revoke contracts plus default-deny egress decisions and audit |
| Secrets | metadata display only | create/rotate/revoke secret references through Secret Broker boundary; never return values to Web |
| Tool access | explanatory empty state | capability profiles, allow/deny bindings and high-risk approval policy |
| Usage/budgets | unavailable placeholder | neutral usage records, currency/period/source, budgets and explicit unavailable provider data |
| Settings | language works; most controls are static/disabled | functional identity/profile/deployment/security/retention/portability settings with role checks |
| Import/export | disabled | signed/versioned export; validate/dry-run/import into an empty target; never overwrite implicitly |
| Search/view controls | navigation search works; task view/filter/sort are decorative | real task query, list/board selection, filters, sorting and accessible persisted preferences |
| Office | renderer/projection exists | consumes formal organization/work state without owning business logic |

## Product contracts

### Identity and tenancy

- Every formal request resolves a current human identity per request.
- Company membership, tenant, token audience, role, session expiry and action
  authorization are checked server-side.
- Agent identities never approve their own high-risk actions.
- A local bootstrap identity, if admitted, is restricted to self-hosted setup
  and must become an explicit, auditable real-human account rather than a Demo
  identity.

### Commands and concurrency

- Mutations use stable command schemas and return structured codes/parameters.
- Organization, responsibility, Connector and governance mutations carry an
  expected revision and fail with `409` on stale writes.
- Work dispatch and external actions require idempotency keys.
- Cancellation, timeout and outcome-unknown states never guess whether an
  external side effect happened.

### Data and evidence

- Formal state persists through the existing durable-store boundary.
- Secret values, vendor sessions, private reasoning and raw credentials never
  enter Company OS events, projections, browser payloads, backups or logs.
- Evidence is admitted only with provenance and digest; attachments are not
  evidence by default.
- Export/import preserves schema version, digest and tenant boundary.

### UI behavior

- Every accepted primary action has loading, success, empty, structured error,
  permission-blocked and stale-write behavior.
- No button is disabled merely because its backend was not implemented.
- Product language can switch independently of stored user/Agent/evidence text.
- Desktop and mobile retain complete create, decision and recovery journeys.

## API slices

All routes are versioned under `/api/v1` and scoped by company unless noted.

1. Formal access, session and companies: public sanitized identity-provider
   readiness, OIDC login/logout/callback, session status,
   company list/create/open and current membership.
2. Organization: organization projection and revisioned department/human/Agent
   commands.
3. Responsibility: contract list/create/update/retire.
4. Goals/projects: list/create/update/archive and their scoped relationships.
5. Work: query/create/detail/cancel, attempts, events and idempotent execution
   commands.
6. Inbox/approvals/evidence/activity: dedicated projections and exact approval
   decision commands.
7. Administration: Connector, model route, data authorization, Secret
   reference, tool policy, usage/budget and egress projections/commands.
8. Settings/portability: safe profile projection, mutable preferences and
   policy, export, import validation and restore.

Adapters validate external JSON before invoking application services. HTTP
does not expose adapter or database types.

## Implementation slices

Each slice must finish with focused tests and a buildable repository.

1. Runtime and request identity: formal self-hosted composition, sanitized
   OIDC readiness, restricted pre-auth shell, request-scoped identity context,
   Web runtime selection, session/company bootstrap.
2. Company and organization: durable company, department, human and Agent
   commands plus browser flows.
3. Responsibility, goals and projects: durable registries, APIs, projections
   and complete UI editing.
4. Multi-work execution: query/detail, Connector dispatch, attempt lifecycle,
   cancellation/idempotency and responsibility-bound task creation.
5. Inbox, approval, evidence and activity: dedicated projections and complete
   decision/history flows.
6. Governance: Connector/model/data/Secret/tool commands, health and fail-closed
   policy evaluation.
7. Usage, settings and portability: trustworthy provider-neutral records,
   budgets, preferences, export/import/recovery.
8. Product completion: task filters/views, accessible error/loading states,
   responsive browser QA, migration/rollback docs and full verification.

## Commands

- Install: `npm install`
- Develop Web: `npm run dev`
- Run self-hosted service: `npm run start:self-hosted`
- Unit/integration/API tests: `npm test`
- Browser tests: `npm run test:e2e`
- Type check: `npm run typecheck`
- Dependency boundary: `npm run check:boundaries`
- Build: `npm run build`
- Full gate: `npm run verify`

## Project structure

- `core/`: vendor-neutral company, responsibility, work and governance rules.
- `ports/`: replaceable identity, persistence, Connector and policy contracts.
- `application/`: commands, projections and authorization orchestration.
- `adapters/`: HTTP, identity, persistence, Connector and deployment adapters.
- `web/`: Company OS-owned interface and API client.
- `connector-sdk/`: neutral external Agent integration contract.
- `tests/`: unit, integration, API and E2E evidence.
- `docs/`: contracts, ADRs, operations, migration and verification records.

## Code style

External transport input is parsed before reaching an application service;
commands use named, immutable fields and stable error codes:

```ts
const result = await service.execute({
  companyId,
  actorId: identity.actorId,
  expectedRevision,
  idempotencyKey,
  draft,
});
```

TypeScript remains strict ESM with named exports. Core and application types do
not contain HTTP, browser, Raft, Nostr, Paperclip or vendor SDK concepts.

## Testing strategy

- Unit: validation, lifecycle, authorization, revision, idempotency and policy.
- Integration: durable store restart, request identity, API/application
  composition, Connector fake, export/import and rollback.
- API: schema, security headers, origin/body limits, structured errors and
  cross-tenant denial.
- E2E: first run; organization; goals/projects; task execution; approval and
  evidence; governance; settings/export; restart persistence; mobile.
- Visual/runtime: every accepted section at desktop/mobile, zero console errors
  and no horizontal overflow.
- Full gate: existing independence, boundary, secret, dependency, build and
  performance checks remain mandatory.

## Boundaries

Always:

- preserve Company OS ownership and inward dependency direction;
- bind every Agent to an accountable human and every executable work item to a
  responsibility contract;
- use test connectors and fake identities for automated tests;
- keep Demo unmistakably labelled and isolated.

Ask first:

- introduce a new production database or managed-cloud service;
- require real vendor credentials, paid APIs or production data;
- change who may approve or bear responsibility.

Never:

- store raw secrets, private vendor sessions or chain-of-thought;
- treat a fixture as a real Agent;
- make Paperclip a runtime dependency or copy its branding/private types;
- weaken formal identity gates to make tests or Demo easier.

## Success criteria

1. Every visible action in the accepted interface is operational or truthfully
   blocked by an external configuration requirement with a structured code.
2. Self-hosted formal company state survives service and browser restart.
3. A human can complete company → organization → responsibility → goal/project
   → task → Connector attempt → approval → evidence/result → audit end to end.
4. Governance mutations are durable, revisioned, role-protected and sanitized.
5. Import/export round-trips into an empty target and rejects tampering and
   overwrite.
6. No formal command succeeds under Demo, cross-tenant, expired, wrong-audience
   or unauthorized identity.
7. Unit/integration/API/E2E, typecheck, build, security, independence,
   performance and visual QA all pass.

## Confirmed first-run identity contract

Formal mode requires enterprise OIDC from the first launch. When issuer,
client ID, redirect URI, or server-side session signing material is missing,
the service may start and the browser may enter a restricted shell containing
identity settings and diagnostics. It must not reveal company data or enable
company creation, organization changes, Agent execution, approvals, or
governance access.

Readiness and authentication failures use stable codes with structured
parameters. English error text is never a Web/API contract. Demo remains an
explicitly selected, isolated fixture route and cannot establish a formal
session or weaken the formal gate.
