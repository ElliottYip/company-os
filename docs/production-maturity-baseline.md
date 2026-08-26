# Company OS production maturity baseline

Status: active completion contract, 2026-08-26.

This document separates implemented product contracts from production evidence.
Passing an in-memory or adapter-level test does not by itself prove that an
operator can install Company OS, connect enterprise infrastructure, survive a
restart, and complete the same workflow through the Web.

The comparison target is Paperclip-level end-to-end operability, not Paperclip
source compatibility. Company OS remains independently owned and runnable.

## Evidence captured at baseline

`npm test` passed on 2026-08-26 with 510 cases (506 passed and four explicit
environment-gated live cases skipped in the credential-free run). The live
PostgreSQL database, OIDC and reference Connector cases passed separately
against disposable infrastructure. The complete `npm run verify` gate also ran
19 browser E2E cases (15 passed and four environment-gated live infrastructure
cases skipped); all four live browser gates separately passed in the current
admission—one with the temporary HTTPS reference IdP, one with real,
digest-pinned Keycloak 26.7.2, one with the full self-hosted Compose topology,
and one with managed-cloud plus external PostgreSQL/OIDC—against isolated
PostgreSQL environments.
The staging operations path now also has a read-only runtime inspector. It
reconciles retained startup state with exact digest-addressed API/Web images,
container health and loopback probes, while keeping customer acceptance a
separate authority. Partial or failed starts remain visible as stable
operator-review states instead of being silently retried or promoted.
Planned staging restart is now an explicit authorized state machine rather than
a runbook-only command sequence. It requires a database-derived zero-blocker
drain proof, serializes against first start, restarts only API and Web, verifies
exact runtime health, compares the post-restart durable-state digest, and
retains one private immutable record per operation. Failure never triggers an
automatic database rollback or implies customer acceptance.
The release store now distinguishes the startup-bound active release from a
newly installed candidate. Staging N+1 no longer changes N's health/image
assessment or prevents an authorized N restart; status reports both immutable
coordinates so upgrade automation cannot silently treat installation as
cutover.
Planned maintenance now has a durable instance-wide dispatch boundary. A
formally authenticated instance administrator freezes new accountable work
through a revision-fenced API command with an external authorization reference;
the current state and every transition are retained in PostgreSQL. Drain proof
fails while dispatch remains open, and post-restart adoption binds the exact
frozen revision before an administrator may explicitly reopen it. Existing
admitted work continues to drain, so the control is not misrepresented as a
Connector kill switch.
Staging startup is now bound to a strictly validated, secret-free external
dependency manifest. The manifest names the dedicated PostgreSQL, product-scoped
OIDC client, Vault Broker, Agent Node, Data Node, ingress and off-site backup
boundary together with portable owner and evidence references. Startup retains
its digest, and runtime inspection fails closed if the file later drifts; this
proves declared coordinates and accountability, not that the external services
have been provisioned or accepted by the customer.
The admission includes dependency-boundary, Paperclip-independence, asset,
research-governance, secret, production-dependency, type, build, and Web
performance checks. The production dependency audit has no moderate, high, or
critical finding. The unused Drizzle Kit CLI is no longer a root dependency,
and production API and operations images omit optional tooling while retaining
`drizzle-orm` and the versioned SQL migrator required at runtime.

The same admission also validates runtime Web configuration, exact
credentialed CORS and self-hosted deployment artifacts. API and Web verification
images built successfully, ran as UID 1000, and returned their liveness and
public runtime-configuration responses from temporary loopback containers.
The live PostgreSQL migration, retained company-closure transaction and
PostgreSQL + HTTP Connector approval restart suites passed against an isolated
PostgreSQL 16 container before it was removed; their default skip preserves
credential-free local verification.
The operations image also completed a current-run encrypted PostgreSQL 16
admission: `pg_dump` streamed directly through AES-256-GCM, critical manifest
metadata was authenticated, a separate empty target accepted a two-pass
authenticate-then-stream restore, the retained marker event matched, and the
backup volume contained zero plaintext dump artifacts.

The portable company path now restores through one global atomic command rather
than a pre-created tenant shell. It rejects Demo or active/in-flight backups,
requires the signed-in administrator to already be the recorded human, and
rolls back company, membership, grants and control-plane state together. Its
live PostgreSQL case is part of the environment-gated database suite; no
cross-identity rebinding is claimed. A read-only server preflight proves the
same eligibility rules and returns a bounded summary; the Web displays that
summary and requires explicit confirmation before sending the restore command.

The Web application client exposes every accepted customer mutation through a
formal HTTP route. Demo-only mutations are explicitly rejected by the formal
client. In addition to controlled browser projections, the browser admission
suite now runs the production composition through a temporary HTTPS edge,
reference OIDC provider and isolated live PostgreSQL database. Formal dispatch
also proves that declared data decisions and opaque Broker grants are durable
before the outbox may submit a Work to its Connector; incomplete preparation
keeps the command pending. A combined synthetic admission now drives three
independent loopback fixture nodes through the real HTTP Data Node, Secret
Broker and Agent Node clients: governed data authorization, a secret-free lease,
high-risk pause, exact human approval, resume, evidence/result completion and
lease revocation. Crash-interrupted preparation is projected as `PENDING` and
can only be retried by the original human initiator in a fresh formal session;
Company OS does not invent a background identity. External customer-node
acceptance remains a product gap, and reference nodes or test doubles are never
represented as real Agents or enterprise systems.
The public Connector SDK runtime validator now admits the same secret-free
model binding as the typed Task input and OpenAPI contract. It requires the
binding's exact opaque grant to be present in the submission, rejects malformed
classification or residency values, and rejects credential-shaped extensions.
Formal dispatch now also evaluates persisted company, Agent and project budget
policies before creating a new Work. A reached hard-stop policy returns a
stable conflict before any Work, Attempt or Connector side effect; idempotent
replay of an existing Work is preserved.
Authenticated Agent observations now atomically ingest digest-bound model
usage into the revisioned budget ledger. Company OS derives the provider,
model, company, Work and Agent from frozen Attempt authority; Connector-authored
usage cannot override those fields, and changed replays fail closed.
The no-route-interception browser admission now also registers the maintained
HTTP Agent Node package, creates an Agent, configures `publish-content` as an
approval-required capability, activates its responsibility contract, dispatches
one Work exactly once, survives API restarts, decides the exact high-risk action
through the Web, delivers PAUSE/RESUME, and verifies the terminal Activity,
Evidence and approval-history projections. The same admission then creates a
second concurrent Work, collects a running observation, requests cancellation
through the Web, delivers CANCEL exactly once, restarts the API again and waits
for Connector-confirmed `CANCELLED` rather than presenting request acceptance as
completion. A third Work uses the Connector-declared 20-second frozen deadline:
the supervisor marks its running Attempt `OUTCOME_UNKNOWN`, the Web binds a
`SAFE_TO_RETRY` decision to admitted digest-only evidence, and a fresh-authority
Attempt is submitted exactly once. The original Attempt is never replayed. The loopback node is an explicitly
synthetic protocol fixture, not a real Agent.

## End-to-end capability matrix

| Capability | Implemented evidence | Evidence still required for mature delivery | State |
|---|---|---|---|
| Independent runtime | Boundary and independence guards; no Paperclip package or schema dependency | Repeat in release container/image admission | Contract complete |
| PostgreSQL storage | Five ordered, non-destructive migrations with an advisory lock; durable event/outbox/checkpoint/backup adapters; current-run PostgreSQL 16 concurrent-migration/restart/tenant/backup admission passed locally with no skips and is configured in CI; a second live admission provisions a distinct runtime role, proves required Company OS DML, and proves PostgreSQL denies schema creation/alteration, role creation, truncate and temporary-table authority; the support policy now admits current-minor PostgreSQL 16.15 and 17.11 only, pins both official image manifests, and a real 16→17 logical dump/restore preserved the migration journal and Company OS marker while leaving the 16 source unchanged as a parallel rollback boundary | Retain green CI service runs and repeat the support admission whenever an upstream minor changes | Dual-major repository compatibility complete; CI retention pending |
| Enterprise identity | Better Auth-owned auth routes; a temporary HTTPS reference IdP proves two distinct authorization-code + PKCE identities, issuer/JWKS validation, signed claims, isolated durable PostgreSQL sessions and one-user sign-out without affecting the other; the first user creates a real company/organization, the second accepts a tenant-bound one-time invite, receives operator grants and is denied permission administration; versioned member directory; atomic role/status mutation with last-Owner and accountable-human guards; explicit trusted-proxy client-IP chain; auth records use application-generated portable UUIDs while OIDC `sub` stays external; current-run Chromium admission (no route interception) proves OIDC redirect/callback, secure session, first-admin claim, two company/organization records, UI switching, refresh persistence, a real API process outage, stable browser failure state, same-database API restart, authenticated tenant recovery and sign-out relock; a second no-interception gate against digest-pinned Keycloak 26.7.2 caught and corrected the canonical Generic OAuth callback; the release-shaped Compose gate then proved separate TLS Web/API origins, exact trusted Web return, real Discovery/JWKS, S256 PKCE, first-admin claim, durable company/organization setup and refresh persistence; a coordinate-free customer preflight now verifies exact HTTPS Discovery, S256 and trusted CA transport without creating identity state | Execute the documented customer staging browser acceptance against the first production enterprise IdP | Multi-provider, verified-TLS and process-recovery verticals complete; customer acceptance pending |
| Company and organization | Formal create, first-owner setup, revisioned organization, human invite and Agent responsibility draft; departments have add/edit plus guarded archive/reassignment across principals, positions, workspaces and project scope; company name/purpose/locale use a dedicated compare-and-swap command and PostgreSQL atomically updates the directory plus event projection; Web profile edits preserve opaque principal IDs and cannot alter Agent runtime/autonomy/responsibility; accountable-human transfer atomically updates organization, contract and reporting line; human access suspension and terminal Agent lifecycle retain historical principals rather than deleting responsibility evidence; company closure now requires a fresh digest-bound export and atomically archives access/invites only after approvals, Work and outbox are resolved, while retaining responsibility evidence; the deployment-owned retention contract reference is sanitized into Settings and the service rejects a browser-selected mismatch without interpreting it as an erasure deadline | Retain live full-stack multi-user permission-negative cases and run closure/recovery against a deployed backup target with a declared legal-hold/retention policy | Vertical complete; deployment evidence pending |
| Goals/projects/work | Tenant-authorized narrow Goal/Project commands with server-owned IDs/timestamps, revision fencing, explicit transition matrices and terminal Project archive; paginated Work catalog/detail; accountable dispatch; durable Attempts; cancellation distinguishes accepted request from Connector-confirmed terminal state; unknown outcomes require admitted evidence; `SAFE_TO_RETRY` creates a new Attempt only after fresh identity, Agent, responsibility, data and Connector validation; an Attempt-scoped, resumable, secret-free Activity timeline is available through API and Web; a production supervisor scans durable Attempts before Connector redrive: never-started work becomes `TIMED_OUT`, expired unstarted leases return to `QUEUED`, and RUNNING/AWAITING_APPROVAL/CANCELLATION_REQUESTED work becomes `OUTCOME_UNKNOWN` without automatic retry; formal task creation can bind an active data authorization contract plus exact operation, purpose, classification and export constraints without exposing enterprise records; interrupted execution preparation is projected explicitly and the original initiator can reauthorize it through the formal API/Web without background impersonation; the Web follows bounded server cursors instead of silently truncating Work, Activity or Run timelines, derives phase from each Work's own latest Attempt, and provides persisted list/board, active/resolved and ordering controls; formal mode permits multiple Work records instead of inheriting Demo's single-task gate; the live no-interception admission proves approval completion, Connector-confirmed cancellation, automatic running timeout, evidence-bound `SAFE_TO_RETRY`, fresh-authority Attempt creation, a customer Data Node interruption followed by initiator reauthorization, and exactly-once Agent submission across API restarts | Preserve this live admission in release qualification | Core, automatic expiry, cancellation, safe retry and interrupted-preparation recovery verticals complete |
| Connector execution | Neutral SDK, installed-package loader, capability/health validation, outbox, redrive, observation ordering, pause/resume/cancel; separately installable client and maintained reference-node packages interoperate across node reconstruction; the node has constant-time authentication, durable secret-free protocol state and idempotent commands; Agent, Data and Secret Broker packages now ship complete OpenAPI 3.1 protocol `1.0` artifacts with route-drift and forbidden-material guards; live PostgreSQL admission reconstructs four service compositions, routes the human decision through signed Better Auth Cookie + membership + formal HTTP API, sends PAUSE/RESUME once and finishes with evidence/result and empty outbox; formal dispatch blocks `SUBMIT` until every declared data decision and execution grant is durable; a combined synthetic three-node admission exercises the real Data Node, Broker and Agent HTTP clients through pause/resume, completion and lease revocation without exposing bearer values; managed-cloud now exposes the same Agent/Data/Broker configuration boundary as self-hosted, and a real TLS admission validates all three authenticated health protocols without disabling certificate verification; a separately packaged Codex driver now forces ephemeral JSONL execution, stdin prompts, read-only sandboxing, file-injected node authentication and digest-only result publication, and a real locally authenticated non-production Codex inference passed its schema-bound minimal admission without enterprise data; the root project and maintained Connector/Broker packages are explicitly Apache-2.0 under Copyright 2026 Yilun Ye, while separate third-party and AgentBoss School notices remain intact | Run the documented side-effecting staging checklist against the deployed customer-owned Codex Agent Node | Integrated reference, real local Codex driver admission, verified-TLS preflight and release-license verticals complete; customer staging acceptance pending |
| Models and Secrets | Installed-package boundaries, reference-only control-plane records and fail-closed policy validation; formal task assignment can select an enabled model policy, while the server resolves an installed Provider and active `MODEL_PROVIDER` reference, freezes route/model/classification/residency/credential-version and a canonical Provider-capability digest into the Attempt, issues an exact replay-safe `MODEL_INFERENCE` opaque grant, and sends the Agent Connector only a secret-free model binding plus that grant reference; pending delivery rejects Provider capability drift and safe retry resolves fresh model authority and re-runs preparation; the installed HTTP Secret Broker package proves metadata lookup, audited opaque lease issuance, adapter reconstruction and revocation without material exposure; terminal Attempts automatically revoke active leases with idempotency and bounded retry backoff; the formal API and Web start Broker-owned create/rotate/suspend/revoke sessions, reject credential fields, persist no management URL, and confirm exact metadata transitions; `WORK_EXECUTION` leases remain bound to the exact Connector consumer; the local Codex admission proves actual provider inference and usage parsing; the maintained Vault KV v2 adapter and execution-only OpenAPI now prove an exact opaque lease can be redeemed over authenticated HTTP into a Codex child-only environment without material entering Broker or driver state; a digest-pinned official Vault admission proves real AppRole, KV v2 CAS create/rotate, exact-version redemption, stale-lease fencing, suspend/revoke, restart persistence and secret-free state | Deploy the attested Vault Broker and Codex Agent Node against the customer-operated enterprise Vault, validate the combined real `MODEL_INFERENCE` path, and retain customer acceptance for each reference lifecycle operation | Control-plane authority, local real inference and official-Vault lifecycle compatibility complete; customer environment acceptance pending |
| Data governance | Authorization lifecycle, default-deny egress decisions, audit events and Web controls; the maintained HTTP Data Node package is independently installable and returns references/digests only; the application binds request ID, Work, Agent, contract, purpose, classification, destination and digest before calling exactly one healthy source owner, persists denial without touching the node, and replays idempotently after adapter reconstruction; formal Work preparation passes only resulting references and evidence into the exact Attempt before Connector delivery; the combined synthetic execution admission proves raw source data and node bearer values never enter control-plane events or the Agent request | Prove a customer-owned Data Node against a real enterprise test source | Integrated reference vertical; customer acceptance pending |
| Approval/evidence/responsibility | Exact-action binding, human decision, evidence digest, result and immutable responsibility projection; live PostgreSQL + independent HTTP Node proves pause/decision/resume/result across repeated service composition restart, with the decision entering through a signed enterprise session and formal HTTP API; a tenant-authorized accountability ledger joins pending/completed/expired approval history and digest-only evidence metadata; a separate idempotent accountability-export command now binds server-owned retention/export policy references and emits only approvals, digest evidence and responsibility chains—not backup events, credentials, vendor sessions or enterprise records; the Web revalidates tenant, references, forbidden fields and SHA-256 before download; the no-interception browser admission now downloads that package after a real OIDC→Work→approval→result chain, verifies its digest and exact references, restarts the API, and proves an identical replay for the captured idempotency command; the export projection consumes Company OS's canonical durable Work and Attempt authority records rather than requiring a second event shape | Repeat the governed export against a customer-owned Agent driver and customer-approved external handling procedure | Governed reference vertical complete; customer acceptance pending |
| Web product | Company-first onboarding, all accepted pages, English/Chinese, mobile/keyboard and formal API client; the Activity page consumes a paginated, tenant-authorized, raw-payload-free formal event projection, while Dashboard/Inbox/Approvals/Accountability use the authoritative Work title and accountable human instead of Demo copy; Inbox tabs project real pending, assigned and terminal records from the accountability ledger and latest server Attempt rather than acting as decorative controls; Agent action policy editing distinguishes blocked, allowed and human-approved actions, and serializes revision-fenced mutations before refreshing authoritative state; formal access, company/member directories, organization, planning, Work/Attempt, accountability and administration inputs are deeply validated at the Web trust boundary, fail closed on cross-tenant identifiers and reject credential/private-session fields; every formal JSON and OIDC-start response also has a 4 MiB decoded-body ceiling, JSON media-type admission, declared/actual length checks and stable empty/malformed response errors; requests have a complete-response 30-second deadline, map private network and 502/503/504 gateway failures to stable offline state and never implicitly retry timed-out mutations; browser gates prove route-level failure, real API outage/recovery, and the full formal Work→approval→evidence path without route interception; pending enterprise execution preparation exposes an explicit original-initiator recovery action rather than silently retrying | Retain current-run browser evidence and execute the customer staging acceptance matrix | Integrated reference product vertical complete; customer acceptance pending |
| Deployment profiles | One codebase; independently built non-root API and Web images; runtime Web configuration; exact credentialed CORS and exact Better Auth trusted origins; both profiles now run migrations and runtime-role provisioning as separate one-shot jobs, and the API receives only the restricted database coordinate; the live self-hosted gate runs separate TLS Web/API services with PostgreSQL, migrations and Keycloak; the live managed-cloud gate reuses the same images while PostgreSQL/OIDC remain external, keeps public first-admin claim undiscoverable, provisions one already verified human server-side, then completes company/organization creation and refresh persistence through Chromium; both live gates passed after the role split, then each restarted its PostgreSQL and API containers, returned to readiness and proved company, membership, user, session and domain-event state remained present and unchanged; release automation now has a read-only qualification job that must pass the complete repository, PostgreSQL, Keycloak, verified-TLS boundary, soak and both Compose gates before a separate least-privilege publish job can push five digest-addressed API/Web/operations/Codex/Vault images; the release manifest binds all five images, exact source, lockfile, ordered migration digests, public protocol versions, runtime versions and required qualification commands; a read-only first-install doctor now rejects mutable images, public-config gaps, unsafe Secret metadata, insufficient host budgets, occupied/unobservable ports and pre-existing target project/network before any staging mutation; the received handoff now requires an exact regular-file allowlist and a prepare-only installer atomically retains it under a version/source-bound release ID, preserves prior payloads and records `PREPARED_NOT_STARTED` without invoking Docker or reading Secrets; target-side prepare and doctor now run from the exact attested operations image rather than assuming a source checkout or host Node.js, with the prepare stage denied network and Docker-socket access; an independently authored authorized-start state machine binds the prepared release and external change record, serializes doctor/config/pull/migrate/role/API-ready/Web-smoke actions, records only `STARTED_NOT_ACCEPTED` on success and pauses ambiguous migration failures for review without an automatic down migration; all five images built locally from the current verified source; Apache-2.0 is selected and mechanically admitted with NOTICE/third-party separation | Execute the protected release workflow and retain registry-side attestation verification; provide the independently owned external staging prerequisites recorded in `docs/staging-raft-xin.md` | Both release-shaped deployment Profile verticals, restart recovery, licensing and pre-publish qualification complete; external staging infrastructure pending |
| Operations | Versioned allowlisted startup/shutdown/Connector failure logs; liveness and dependency-aware readiness; readiness actively probes each installed Connector, model provider, Secret Broker and Data Node, treats optional unhealthy runtimes as degraded and never returns provider-private errors; default-off, private-exposure Prometheus HTTP counters/gauge/histogram with fixed labels, including bounded `data_node`, Connector-command outcome and lease-revocation outcome categories, and no customer identifiers; minimum alert/retention guidance; forward-only upgrade and parallel-restore rollback contract; a non-root PostgreSQL 16.15 operations image passed a real source→empty-target dump/restore, schema check and retained-event comparison; a second admission built frozen N-1 `0004` state, backed it up, migrated through the current API image to `0005`, proved legacy company/event operations, and restored the exact N-1 journal/data into a parallel rollback database; the adjacent-major admission now proves the supported 16→17 logical migration without mutating the rollback source; self-hosted has an opt-in scheduled AES-256-GCM streaming backup profile with deployment-injected key, atomic ciphertext/manifest and a minimum one-hour interval; a current-run disposable PostgreSQL admission proved ciphertext-only backup, authenticated two-pass direct-stream restore, retained data and zero plaintext artifacts; the release-cutover planner now requires distinct source/API digests, exact-prefix migration history, stable runtime/protocol contracts, ordered evidence IDs and parallel-database rollback while always labelling its output `PLANNED_NOT_EXECUTED`; a second coordinate-free planner binds an immutable release to every staging/production evidence slot and authorization class without accepting owner identities or claiming execution; the customer acceptance schema v2 separately binds release, opaque owners and evidence for real model execution plus every other staging/production boundary without self-attesting their truth | Execute the plan against two actually published releases, rehearse the customer-owned off-site backup target and validate a real customer staging record | Repository-controlled recovery, cutover and acceptance contracts complete; external execution evidence pending |
| Security | STRIDE/Agent abuse-case threat model; origin and body limits; restrictive response headers; explicit request/header/keep-alive/header-count/request-per-socket/connection bounds; Better Auth database-backed login rate limiting; tenant checks; secret scan; production dependency audit with no high/critical finding; release image SBOM and maximum provenance workflow; migration/runtime PostgreSQL roles are separated and denial-tested against five privilege-escalation capabilities in both release-shaped profiles; a repeatable HTTP admission sustains 1,500 bounded-concurrency health requests plus 300 malformed, oversized and deliberately failing API requests, proves structured errors do not echo a synthetic secret, observes dependency failure and recovery, and enforces a p95 latency budget; release qualification adds a 30-second same-process mixed-traffic soak, while a separate trusted-CA HTTPS admission proves IdP/Agent/Data/Broker transport without disabling certificate verification | External production hostname/certificate/ingress acceptance and production-duration soak remain | Repository-controlled hardening and RC qualification complete; external acceptance pending |

## Readiness semantics

`GET /health` is liveness only. It reports the actual runtime mode and must not
touch PostgreSQL, OIDC, a Connector, a model provider, or a Secret Broker.

`GET /ready` is traffic admission. It actively invokes the installed Connector,
model-provider, Secret-Broker and Data-Node health contracts and returns `503`
when a required public deployment dependency fails. Optional execution/provider
packages are reported as `degraded` rather than invented as healthy; the
corresponding product capabilities continue to fail closed. Private local
development may be ready with degraded formal configuration because its
isolated local/Demo surface is intentional.

Neither endpoint contains credentials, tenant IDs, package names, database
addresses, external sessions, or provider-private error text.

## Ordered closure plan

1. Retain real-PostgreSQL migration, restart, tenant, backup and restore admission.
2. Retain the two-user reference OIDC/invite/permission harness and real-browser
   company switch/sign-out admission without route interception.
3. Publish the first production-grade Connector/Secret Broker/model adapter
   packages behind the existing neutral contracts.
4. Retain the live PostgreSQL Connector restart admission and extend the proven
   pause → human decision → resume → evidence/result path through authenticated
   HTTP API and Web entry points.
5. Retain self-hosted API/Web image admission and complete a live Compose smoke;
   add the managed-cloud deployment specification and immutable release artifacts.
6. Add bounded operational metrics, release provenance, upgrade and restore
   drills, then run the complete live-stack acceptance matrix.

The product is not called production-complete until every `Product gap`,
`Integration gap`, and `Hardening gap` above has direct current-run evidence.
