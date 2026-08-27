# Formal API boundary

Production maturity and live-stack evidence are tracked separately in
[`production-maturity-baseline.md`](production-maturity-baseline.md). Contract
tests do not substitute for PostgreSQL, OIDC, Connector, restart, and deployment
acceptance.

The versioned formal API is separate from `/api/demo`. Demo identity can never
authorize a formal request, and a formal tenant read is resolved through
`IdentityPort` plus an explicit authorization receipt.

## Agent Boss projection v1

`GET /api/v1/companies/{companyId}/agent-boss`

The response is a Company OS-owned projection containing organization, humans,
Agents, responsibility-contract revision, accountable work, execution-attempt
summaries, and pending exact-action approvals. `schemaVersion` is the wire
compatibility boundary; UI code must not inspect persisted events directly.

Errors use a stable non-localized contract:

```json
{"error":{"code":"TENANT_MISMATCH","parameters":{}}}
```

Display copy is not an API contract. Current stable codes are
`FORMAL_IDENTITY_REQUIRED`, `TENANT_MISMATCH`,
`AUTHORIZATION_PRINCIPAL_MISMATCH`, `ORGANIZATION_NOT_FOUND`,
`FORMAL_API_UNAVAILABLE`, and the closed fallback `OPERATION_REJECTED`.
User input, Agent output, evidence, and audit records retain their original
language; later localization maps codes in the client without changing domain
records.

## Instance maintenance v1

`GET /api/v1/instance/maintenance` and origin-checked `PATCH
/api/v1/instance/maintenance` are Instance Administrator boundaries, not
tenant-scoped company controls. The revisioned state supports `OPEN`,
`DISPATCH_FROZEN`, and `ACCEPTANCE_ONLY`.

`ACCEPTANCE_ONLY` requires an exact plan ID, SHA-256 plan digest, and one to 32
Company/Work ID pairs. Formal Work submission in that mode must repeat the
current operation, plan, and acceptance authorization references; the server
also verifies that the initiating human is an Instance Administrator. The
client cannot authorize acceptance merely by labelling a Work.

The stable state transition is `OPEN -> DISPATCH_FROZEN -> ACCEPTANCE_ONLY ->
OPEN`, with `ACCEPTANCE_ONLY -> DISPATCH_FROZEN` for rejection or incident
review. Every transition is revision-fenced, retains the same operation ID,
and uses a new external authorization reference. See [ADR
0045](adr/0045-bounded-acceptance-only-dispatch.md).

## Human member directory v1

`GET /api/v1/companies/{companyId}/human-members` returns the authenticated
tenant's enterprise-human membership projection: opaque user ID, identity
provider display name and email, Company OS role, membership status, and
membership timestamps. It is authorized independently from the organization
chart; changing identity profile data never changes a position, permission, or
accountable-human assignment. The endpoint does not expose OIDC tokens,
sessions, provider account IDs, or permission-grant rows.

`PATCH /api/v1/companies/{companyId}/human-members/{userId}` changes only the
Company OS membership role and active/suspended access state. The command
carries the expected prior role and status as a concurrency fence, replaces
role-derived grants, and records the change in the same PostgreSQL transaction
as its audit event. It fails with stable codes when the caller attempts to
remove the last active Owner (`LAST_ACTIVE_OWNER_REQUIRED`) or suspend a human
who still owns an Agent responsibility (`ACCOUNTABLE_HUMAN_TRANSFER_REQUIRED`).
It never rewrites an organization position or responsibility contract.

## Agent Boss commands v1

`PATCH /api/v1/companies/{companyId}/profile` changes only company name,
purpose, and locale. The body carries exact `expected` and `next` profiles for
compare-and-swap concurrency. It cannot change the company ID, membership,
position, permission, Agent, or responsibility graph; the organization event
preserves the existing responsibility snapshot unchanged. PostgreSQL updates
the access-directory company row and appends that organization event in one
transaction, so company discovery and the control-plane projection cannot
diverge across restart.

Agent lifecycle actions use explicit Paperclip-aligned endpoints:

- `POST /api/v1/companies/{companyId}/agents/{agentId}/approve`
- `POST /api/v1/companies/{companyId}/agents/{agentId}/pause`
- `POST /api/v1/companies/{companyId}/agents/{agentId}/resume`
- `POST /api/v1/companies/{companyId}/agents/{agentId}/clear-error`
- `POST /api/v1/companies/{companyId}/agents/{agentId}/terminate`

Each request carries `expectedRevision`. Approval requires a registered,
enabled Connector; reporting-chain-invalid Agents cannot resume or clear an
error; termination is irreversible. Pending Agent configuration changes fail
with stable code `PENDING_APPROVAL_AGENT_CONFIG_FROZEN`.

`POST /api/v1/companies/{companyId}/organization/revisions` owns ordinary
organization-profile edits. It reconciles existing position titles,
departments, and Agent reporting lines in the same revision instead of leaving
the responsibility graph stale. It cannot be used to smuggle a change of
accountable human or autonomy level: those attempts fail with
`RESPONSIBILITY_TRANSFER_COMMAND_REQUIRED` or
`RESPONSIBILITY_AUTONOMY_COMMAND_REQUIRED`. Dedicated atomic transfer
semantics are intentionally not inferred by this general editor.

`POST /api/v1/companies/{companyId}/agents/{agentId}/responsibility-transfers`
is the only command that changes an Agent's accountable human. It carries the
new accountable human, optional backup human, expected responsibility
revision, and a required audit reason. One transactionally appended
organization revision updates the Agent profile, responsibility contract,
position ownership, and reporting line together. A stale revision, no-op,
unknown human, or unresolved exact approval fails with a stable error code;
there is no partial transfer state.

`POST /api/v1/companies/{companyId}/departments/{departmentId}/archive`
requires a distinct destination department, the expected responsibility
revision, and an audit reason. It atomically rehomes humans, Agents, positions,
department workspaces, and project department scopes before removing the
source department. The command preserves stable principal and responsibility
IDs, refuses the last department, and fails while an affected Agent has active
Work or an unresolved exact approval. The same organization event carries the
remapped Goal/Project planning catalog and advances its revision, preventing a
stale project from retaining the archived department ID.

`PUT /api/v1/companies/{companyId}/responsibility-contracts` replaces one
revisioned Company OS responsibility snapshot. This is deliberately separate
from Agent lifecycle: formal work requires an eligible Agent and an `ACTIVE`
responsibility contract.

`POST /api/v1/companies/{companyId}/work` accepts a bounded accountable-work
draft. The route owns `companyId`; the body cannot select another tenant. The
application revalidates the current formal identity, initiator, Agent,
responsibility contract, allowed actions, and exact authorization receipt.
An admitted Work item is scheduled as one idempotent `WorkAttempt`; the event
and secret-free Connector command are committed atomically. Replaying the same
Work does not create another first attempt. Commands remain pending until a
matching live Connector with the frozen capability digest accepts them.

The optional `executionPreparation` object contains bounded `dataAccess` and
`secretLeases` arrays plus an optional `modelRouting` intent. It contains references, policy inputs, expected Secret
versions and lease durations only. The server derives tenant, Work, Agent,
Connector consumer, request time and lease expiry. If present, dispatch freezes
the data contract IDs into the Attempt, records a preparation request, calls
the installed Data Node and Secret Broker, and records only returned
references/digests. `SUBMIT` remains pending with
`WORK_EXECUTION_NOT_PREPARED` until the complete marker exists. A
`WORK_EXECUTION` Secret reference must be active, have purpose
`AGENT_CONNECTOR`, and belong to the exact Connector consumer.

`modelRouting` names the company, policy, data classification and required
residency—not a vendor credential or session. Dispatch resolves the currently
enabled route against an installed, non-unavailable Provider and an active
`MODEL_PROVIDER` Broker reference, fingerprints Provider capabilities, and
freezes the selected route and credential version in the Attempt authority.
Preparation then issues a replay-safe `MODEL_INFERENCE` lease bound to that
Provider. The Agent Connector receives only the route metadata and its exact
opaque grant reference. Before every pending `SUBMIT`, Company OS rechecks
Provider health and the frozen capability digest. A safe retry resolves a fresh
route and obtains a fresh lease rather than replaying the original authority.

`POST /api/v1/companies/{companyId}/approvals/{requestId}/decisions` accepts
`APPROVED` or `REJECTED` plus the complete expected approval binding. The route
owns both tenant and request ID. Any changed action digest, work, contract,
Agent, accountable human, evidence, result, expiry, or prior decision fails
closed.

`POST /api/v1/companies/{companyId}/work/{workId}/attempts/{attemptId}/preparation/retry`
accepts an empty object. It is available only while the exact Attempt is
`QUEUED` with a persisted preparation plan, and only to the original formal
Work initiator. It reruns current data and Broker authorization before
redriving the pending Connector command; it never restores authority by
impersonating a prior browser session.

Mutation requests require an allowed origin and bounded JSON body. Stable
transport errors include `INVALID_FORMAL_COMMAND`, `ORIGIN_NOT_ALLOWED`,
`REQUEST_BODY_TOO_LARGE`, and `FORMAL_COMMAND_UNAVAILABLE`.

## Administration projection v1

`GET /api/v1/companies/{companyId}/administration` returns the revisioned
Connector catalog, model routes, data-authorization contracts, and persisted
egress decisions. It exposes only `secretConfigured` and
`credentialConfigured`; Secret reference identifiers and material are not part
of the response. Connector rows also expose `runtimeHealth` as `HEALTHY`,
`DEGRADED`, `UNAVAILABLE`, or `NOT_BOUND`; catalog status alone is never
presented as proof that an execution port exists. Egress records contain policy
inputs by reference/digest, not exported content.

## Data portability v1

- `GET /api/v1/companies/{companyId}/portability/export`
- `POST /api/v1/companies/restore/inspection`
- `POST /api/v1/companies/restore`

Export returns the Company OS-owned versioned durable backup, including domain
events, Connector outbox delivery state, projection checkpoints, and an
integrity digest. Inspection accepts that same format and performs the complete
eligibility check without allocating IDs or writing company state. Its bounded
response includes the company identity, exact signed-in-human binding,
human/Agent counts, event count, delivered-publication count, and checkpoint
count. The Web displays this server summary and obtains explicit confirmation.

Restore accepts that same format only and atomically creates
the company directory, owner membership, owner permission grants, events,
delivered outbox records, and projection checkpoints. It refuses Demo backups,
pending publication, unresolved Work, pending approval, existing company IDs,
or a backup without a valid organization snapshot. Failure leaves no company or
membership shell behind.

Restore is an instance-administrator operation, requires an allowed origin, and
is bounded to 8 MiB by default. The signed-in user ID must already identify a
human in the restored organization; the service never infers identity rebinding
or changes the backup's responsibility semantics. Stable failures include
`DURABLE_BACKUP_INVALID`, `RESTORE_COMPANY_ALREADY_EXISTS`,
`RESTORE_FORMAL_BACKUP_REQUIRED`, `RESTORE_PENDING_OUTBOX`,
`RESTORE_PENDING_APPROVAL`, `RESTORE_UNRESOLVED_WORK`, and
`RESTORE_IDENTITY_REBIND_REQUIRED`. The former company-scoped import route does
not exist because a company shell created through the normal setup flow is not
an empty restore target.

### Retained company closure

`POST /api/v1/companies/{companyId}/archive` accepts only:

```json
{
  "expectedStatus": "active",
  "exportDigest": "sha256:<64 lowercase hex characters>",
  "retentionPolicyId": "standard-retention",
  "reason": "Customer-requested account closure"
}
```

The digest must match a fresh portability export. Closure requires a formal
active Owner and `users:manage_permissions`, and refuses pending approvals,
non-terminal or outcome-unknown work, pending Connector outbox delivery, a
stale export or a concurrent event/status change. The atomic result archives
the company and memberships, revokes unaccepted invitations and retains the
event/evidence stream. Stable conflict codes are
`COMPANY_ARCHIVE_PENDING_APPROVAL`, `COMPANY_ARCHIVE_UNRESOLVED_WORK`,
`COMPANY_ARCHIVE_PENDING_OUTBOX`, `COMPANY_ARCHIVE_EXPORT_STALE`,
`COMPANY_LIFECYCLE_REVISION_CONFLICT`, and `EVENT_SEQUENCE_CONFLICT`.
`COMPANY_ARCHIVE_OWNER_REQUIRED` is a permission failure. See ADR 0020.

## Connector delivery recovery

Formal dispatch commits the Work, WorkAttempt, and a secret-free
`connector.commands` outbox record before invoking a Connector. When execution
preparation was requested, delivery additionally requires the exact durable
`work-execution.prepared` record; redrive cannot bypass it. A process
supervisor scans all registered company scopes immediately at startup and every
30 seconds by default (`COMPANY_OS_CONNECTOR_REDRIVE_INTERVAL_MS`, minimum 10
seconds). Scans never overlap, failures are isolated per company and attempt,
and a publication remains pending until the Connector acknowledges its
idempotent command. The default service installs no provider Connector; pending
work remains fail-closed until a deployment composition supplies an
`AgentExecutionPort`.

After an idempotent submit is acknowledged, the same recovery supervisor moves
the WorkAttempt through `LEASED` to `RUNNING` with a fencing token and polls the
matching `AgentExecutionPort.observe` stream. Observations are tenant/work
bound, ordered by sequence, bounded, replay-safe, and persisted as
`connector.observation.recorded`. Only evidence outputs carrying a SHA-256
digest enter the formal evidence projection. `COMPLETED` requires a distinct
result reference and atomically drives the fenced attempt to `SUCCEEDED`;
`FAILED` and `CANCELLED` drive their matching terminal states. Connector
session identifiers, credentials, private reasoning, and raw provider payloads
are outside this contract.

### Formal Connector packages

The production service loads optional installed packages named by the
comma-separated `COMPANY_OS_CONNECTOR_PACKAGES` variable. Each package must
export a server-side `createAgentExecutionPort()` factory. Startup waits for
every factory, validates the complete neutral port and capability declaration,
and rejects duplicate Connector IDs. Saved catalog metadata and live runtime
health remain separate states; an unhealthy or missing runtime cannot execute.

Only npm package names are accepted. Filesystem paths, URLs, inline source,
private vendor sessions, and credential values are not configuration inputs to
this loader. Deployment tooling owns package installation and secret injection;
Company OS events and the Web receive capability, health, and reference state
only. An empty package list is valid and deliberately leaves execution
fail-closed.

The first Company OS-owned package is
`@company-os/http-agent-node-connector`. It converts an independently operated
HTTPS Agent node into the neutral port without introducing its HTTP schema into
core or application layers. The package is stateless: idempotency, progress,
pause/resume/cancel state, evidence and result recovery remain owned by the
remote node and the durable Company OS event/outbox records. A reconstruction
test proves that a submitted Attempt is not resubmitted after the control-plane
Store and Connector instances restart, and that ordered observations still
drive the original Attempt to a verified terminal result. The test endpoint is
explicitly synthetic and is not represented as a real Agent.

The package requires HTTPS in production, forbids credentials in its URL or
JSON payloads, disables redirects, bounds request and response bodies, carries
deployment-injected authentication only in the Authorization header, and maps
remote failures to stable codes. See
[`http-agent-node-connector.md`](http-agent-node-connector.md).

Company registration uses narrow commands so the browser never reconstructs a
catalog containing hidden Secret references:

- `POST /api/v1/companies/{companyId}/connectors` registers one installed
  runtime by ID and residency; the service derives its capabilities.
- `PATCH /api/v1/companies/{companyId}/connectors/{connectorId}` changes only
  `ENABLED`/`DISABLED` state and preserves the stored configuration.

Both commands require an allowed origin, formal identity, company permission,
and the current catalog revision. Missing runtimes, duplicate registration,
and revision conflicts return stable codes.

## Data authorization lifecycle

- `POST /api/v1/companies/{companyId}/data-authorization-contracts`
- `PATCH /api/v1/companies/{companyId}/data-authorization-contracts/{contractId}`

The collection command creates one company-scoped grant in `ACTIVE` state and
binds it to existing Agents, operations, purposes, a maximum classification,
validity, and allowed export destinations. The item command changes only its
status: `ACTIVE` and `SUSPENDED` are reversible pause/resume states;
`REVOKED` is terminal. Every command carries `expectedRevision`, keeps model
routing unchanged, and returns stable conflict/not-found codes. The Web never
round-trips hidden credential references and these endpoints accept no Secret
or production data value.

This command shape follows the pinned Paperclip distinction between a paused
connection and a revoked company-scoped grant. The data contract fields and
per-request egress evaluation are Company OS responsibility/data-governance
extensions.

## Formal Secret Broker package

The production service optionally loads exactly one installed npm package named
by `COMPANY_OS_SECRET_BROKER_PACKAGE`. The module exports
`createSecretBrokerRuntimePort()`. Startup validates its metadata-only
capabilities, supported purposes, protocol `1.0`, maximum lease duration, and
complete broker methods before the HTTP service listens. Paths, URLs, inline
source, multiple canonical brokers, and Secret values are not configuration
inputs.

`GET /api/v1/companies/{companyId}/administration` reports the installed
broker's ID, display name, protocol, supported purposes, lease ceiling, and
health, plus whether browser-mediated reference management is supported. It
never returns a reference ID, provider session, version material, or
credential value. No configured package is a valid fail-closed state.

- `POST /api/v1/companies/{companyId}/secret-reference-sessions`
- `GET /api/v1/companies/{companyId}/secret-reference-sessions/{sessionId}`

The first endpoint accepts exactly a reference ID, operation, purpose, provider
adapter ID and expected version. Unknown fields are rejected so credential
material cannot be smuggled through this command. It returns a short-lived
Broker-owned browser handoff. The second endpoint confirms `PENDING`, stable
failure, or a validated metadata-only completion. Management URLs are not
persisted in Company OS events.

The Company OS-owned `@company-os/http-secret-broker` package implements this
boundary against an enterprise-operated HTTPS Broker. Lease issuance is
audited before the Broker call and returns only an opaque, expiring grant plus
an attestation digest. After an Attempt becomes `SUCCEEDED`, `FAILED`,
`CANCELLED`, `TIMED_OUT`, or `OUTCOME_UNKNOWN`, the runtime supervisor
automatically revokes its active leases. Revocation is idempotent; failures
persist only a stable code and use bounded exponential retry backoff. Secret
material and raw Broker errors never enter the event stream. See
[`http-secret-broker.md`](http-secret-broker.md).

## Formal model provider packages and routes

`COMPANY_OS_MODEL_PROVIDER_PACKAGES` lists installed npm packages. Each exports
`createModelProviderRuntimePort()` and declares a unique provider ID, protocol
`1.0`, bounded model catalog, supported residency, and health. Startup waits
for and validates every provider before listening; paths, URLs and duplicate
provider IDs are rejected.

- `POST /api/v1/companies/{companyId}/model-routes`
- `PATCH /api/v1/companies/{companyId}/model-routes/{routeId}`

Creation accepts only installed provider/model/residency capabilities and a
Broker-described Secret reference belonging to the same company, with purpose
`MODEL_PROVIDER`, matching provider ID, and `ACTIVE` status. New routes start
disabled. Enabling repeats those checks and requires provider and Broker health
to be available. The API and Web expose only `credentialConfigured`; they do
not receive the Secret value, version material, or provider session.
The formal task dialog lists only enabled, credential-configured policy choices;
the server remains authoritative and can reject a stale browser selection.
Installed Provider packages are governance adapters, not inference clients:
they expose only capability and health inspection. The customer Agent Node is
the single execution owner and receives the selected secret-free binding plus
its exact opaque Broker grant. Company OS never sends a prompt through the
Provider package. See ADR 0028.

## Accountability ledger

`GET /api/v1/companies/{companyId}/accountability-ledger` returns the formal,
tenant-authorized history of exact approval requests, human decisions and
admitted evidence metadata. Connector evidence is joined to its immutable Work
Attempt and contains only reference ID, SHA-256 digest, kind, time and source;
artifact bytes remain at the execution/data edge. Approval history preserves
the exact action digest, Work, responsibility contract, Agent, accountable
human, evidence set and result binding. Corrupt or fixture-labelled records in
a production stream fail the complete projection rather than being silently
omitted.

`POST /api/v1/companies/{companyId}/accountability-exports` creates a governed,
digest-protected accountability package. The exact request is
`{ requestId, purposeCode }`, where the purpose is `AUDIT_REVIEW`,
`INCIDENT_REVIEW`, or `CUSTOMER_PORTABILITY`; the request ID is the idempotency
key. The server—not the browser—binds the configured retention and export policy
references. The package contains only exact approvals, human decisions,
digest-based evidence metadata, and responsibility projections. It excludes
durable event payloads, artifact bytes, credentials, private vendor sessions,
prompts, reasoning, and enterprise-record contents. Replay with the same request
ID returns the same verified package or fails closed.

Responsibility projection reads the canonical durable `work.dispatched` Work
record together with the matching `work-attempt.recorded` authority snapshot.
It does not require adapters to duplicate that data into an export-specific
event. The release browser admission exercises this path against PostgreSQL and
real OIDC without route interception, validates the downloaded SHA-256 digest,
restarts the API, and verifies idempotent replay.

## Tool profiles, bindings, and policies

- `POST /api/v1/companies/{companyId}/tool-profiles`
- `PATCH /api/v1/companies/{companyId}/tool-profiles/{profileId}`
- `POST /api/v1/companies/{companyId}/tool-profiles/{profileId}/bindings`
- `POST /api/v1/companies/{companyId}/tool-policies`

The vocabulary and evaluation order follow the pinned Paperclip Tool Access
implementation: profiles are `draft`, `active`, `disabled`, or `archived`;
entries include or exclude an application, connection, catalog entry, tool
name, or risk level; bindings target a company, Agent, or project; and
priority-ordered policies can allow, block, or require approval. Archived
profiles are terminal and unmatched access is denied by default.

Company OS currently executes `block`, `require_approval`, and `allow` policy
semantics. `trust_rule` and `rate_limit` remain valid portable catalog values
but fail closed until their complete runtime contracts exist; the Web does not
offer controls that imply otherwise. Every mutation is tenant-authorized and
revision-fenced. High-risk approval still passes through the Company OS exact
action/digest/work/contract/Agent/human/evidence/result binding rather than
becoming a generic tool-log event.

## Verified usage and budget policies

- `POST /api/v1/companies/{companyId}/budgets/policies`

Company OS uses the pinned Paperclip cost and budget vocabulary: cost events
distinguish billing type and `reported` versus `unpriced`; policies scope to a
company, Agent, or project, use `billed_cents`, and apply either a UTC calendar
month or lifetime window. Policy upsert is revision-fenced, defaults to an 80%
warning with hard stop and notification enabled, and validates the real target
scope. The Web converts the authored display currency amount to integer cents.

Before creating a new formal Work, the server evaluates every active company,
Agent and project policy that applies to it. A policy at or above its amount
with hard stop enabled returns stable `BUDGET_HARD_STOP` before a Work event,
generic Work record, Attempt or Connector command is created. Replaying an
already durable Work remains idempotent and is not redefined by spend recorded
after its original dispatch. This is a current-spend gate, not a cost
reservation; external usage ingestion and customer billing evidence remain
part of the execution-plane acceptance contract.

Verified cost ingestion is an authenticated Connector-observation boundary, not
a browser command. A usage record must reference an evidence output carrying
its SHA-256 source digest. Company OS derives company, Work, Agent, frozen
provider and model from the Work Attempt; the Connector cannot author those
authority fields. All usage records in one observation validate and enter the
revisioned ledger atomically, replay by usage reference is idempotent, and a
changed replay fails closed. Token counts and cents are non-negative integers;
`unpriced` records must contain zero cents. The product never invents a price
when a provider reports tokens without a billed amount.

## Goals and projects

- `GET /api/v1/companies/{companyId}/planning-catalog`
- `PUT /api/v1/companies/{companyId}/planning-catalog`
- `POST /api/v1/companies/{companyId}/goals`
- `PATCH /api/v1/companies/{companyId}/goals/{goalId}`
- `POST /api/v1/companies/{companyId}/projects`
- `PATCH /api/v1/companies/{companyId}/projects/{projectId}`
- `POST /api/v1/companies/{companyId}/projects/{projectId}/archive`

The catalog is revisioned and tenant-bound. Goal levels/statuses and Project
statuses follow the pinned Paperclip behavior contract; Company OS adds an
accountable human to every record and validates any Agent owner/lead against
that human's responsibility relationship. The narrow mutation routes generate
opaque IDs and timestamps on the service, authorize the tenant once per atomic
mutation, and use `expectedRevision` as an optimistic-concurrency fence. The
whole-catalog `PUT` remains an administrative compatibility boundary and is not
used by ordinary Web create, transition, or archive interactions.

Goal transitions are `planned -> active|cancelled` and
`active -> achieved|cancelled`; achieved and cancelled Goals are terminal.
Project transitions are `backlog -> planned|cancelled`,
`planned -> backlog|in_progress|cancelled`, and
`in_progress -> completed|cancelled`; only completed or cancelled Projects may
be archived, and archived Projects are terminal. Stable failures include
`PLANNING_REVISION_CONFLICT`, `GOAL_NOT_FOUND`, `GOAL_TRANSITION_INVALID`,
`PROJECT_NOT_FOUND`, `PROJECT_TRANSITION_INVALID`,
`PROJECT_ARCHIVE_NOT_ALLOWED`, and `PROJECT_ARCHIVED`.

## Work catalog and detail

- `GET /api/v1/companies/{companyId}/work?cursor={offset}&limit={1..100}`
- `GET /api/v1/companies/{companyId}/work/{workId}`
- `POST /api/v1/companies/{companyId}/work`
- `POST /api/v1/companies/{companyId}/work/{workId}/attempts/{attemptId}/cancellation`
- `POST /api/v1/companies/{companyId}/work/{workId}/attempts/{attemptId}/reconciliation`
- `POST /api/v1/companies/{companyId}/work/{workId}/attempts/{attemptId}/retry`
- `POST /api/v1/companies/{companyId}/work/{workId}/attempts/{attemptId}/preparation/retry`

`GET /api/v1/companies/{companyId}/work/{workId}/attempts/{attemptId}/events`
returns the formal Activity timeline for one immutable execution Attempt. The
bounded `afterSequence` and `limit` parameters support stable forward paging.
Items include only Company OS-owned state transitions, sanitized Connector
observations, and exact approval decisions associated with that Attempt.
Connector credentials, external sessions, private reasoning, raw provider
payloads, approval notes, and complete persisted event payloads are not part of
this projection. Invalid paging returns `WORK_RUN_EVENT_PAGE_INVALID`; a Work
and Attempt mismatch returns `WORK_ATTEMPT_NOT_FOUND` without crossing the
tenant boundary.

The read model is Company OS-owned and tenant-authorized through the same Agent
Boss application boundary as dispatch. Each catalog item contains the canonical
accountable Work record and only the sanitized Attempts belonging to that Work.
It never returns Connector credentials, vendor sessions, raw reasoning, or
private provider payloads. Pagination is bounded and uses an opaque response
cursor; invalid pagination returns `WORK_PAGE_INVALID` and a missing item
returns `WORK_NOT_FOUND`.

Cancellation is an acknowledgement workflow, not a cosmetic status update. A
queued Attempt that has never reached a Connector can terminate locally. A
leased or running Attempt moves to `CANCELLATION_REQUESTED`, persists a
secret-free Connector command, and remains non-terminal until a matching
Connector observation confirms cancellation. Delivery failure therefore never
causes Company OS to claim the external action stopped. Lease loss or timeout
while cancellation is pending moves the Attempt to `OUTCOME_UNKNOWN` and
requires evidence-backed reconciliation. The endpoint is idempotent and
returns `202` for an accepted request.

Reconciliation accepts only `CONFIRMED_SUCCEEDED`, `CONFIRMED_FAILED`, or
`SAFE_TO_RETRY` plus an admitted evidence ID. The evidence must already exist
as a production evidence record bound to the same Work, or in a sanitized
Connector observation bound to the same Attempt. A success conclusion requires
result evidence rather than a generic artifact. The authenticated actor and
authorization receipt are server-derived; repeated identical reconciliation
is idempotent and a conflicting second conclusion returns
`WORK_ATTEMPT_RECONCILIATION_CONFLICT`.

Retry is available only after a `SAFE_TO_RETRY` reconciliation. It creates a
new Attempt number and idempotency key; it never reopens or mutates the prior
Attempt. Before persisting the new command, the application rechecks enterprise
authorization, current Agent invokability and reporting chain, the active
responsibility contract and allowed actions, every prior data-authorization
reference, Connector availability, and the current capability digest. A changed
accountable human or responsibility contract fails with
`WORK_RETRY_RESPONSIBILITY_CHANGED` so a retry cannot silently transfer
responsibility. The new Attempt receives a fresh authorization receipt and
retains no credential or external session from its predecessor.
