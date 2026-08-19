# Paperclip fixed-SHA competitive code audit

Status: completed key-module/critical-path audit; fine-grained ledger archived

Audit date: 2026-08-18  
Repository: `https://github.com/paperclipai/paperclip`  
Tag: `v2026.817.0`  
Commit: `213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`  
License: MIT, Copyright (c) 2025 Paperclip AI  
Whole-project decision: **REFERENCE ONLY**

This is a competitive engineering audit, not an adoption, compatibility, or
upstream-sync plan. Company OS does not install, call, embed, or inherit
Paperclip. The checkout at `work/upstream-audit/paperclip` is read-only research
input and is excluded from every Company OS product build and deployment.

This document is the Paperclip deep-audit input to the completed first-priority
decision. The separate fine-grained ledger remains a trusted appendix with 704
of 1,560 units complete; the narrowed 2026-08-19 completion model does not
require clearing the remaining 856 units. The final cross-project authority is
`research/competitive-audit/first-priority-architecture-audit.md`.

## Executive judgment

Paperclip is a large, actively developed product with mature operational
patterns. At the audited pin it contains 4,464 tracked files, 111 schema files,
210 SQL migrations, 429 tracked server test paths, 1,270 test/spec paths by the
repository audit expression, 10 CI workflows, 1,025 commits and 97 distinct
author emails in the preceding 90 days. Those figures indicate substantial
engineering investment; they do not establish correctness or supply-chain
safety by themselves.

The strongest lessons are its transaction and lock discipline, migration
safety checks, recovery invariants, plugin capability fail-closed behavior,
plugin database namespace restrictions, secret references, redaction, and
release gates. The principal mismatch is structural: Paperclip's work,
identity, approval, event, schema, Web, and runtime types form one Paperclip
product model. Its Agent hierarchy is Agent-to-Agent; approvals use generic
JSON payload; responsibility is useful attribution but not Company OS's
revisioned accountable-human contract and exact action digest; company live
events are process-local and non-replayable; machine-readable API error codes
are incomplete. Directly importing this stack would make Company OS a Paperclip
derivative runtime instead of an independent product.

No source code is copied by this audit. `copiedCode` therefore remains empty.
Any future reuse requires a separate change with file-level provenance, the
MIT notice, substantive local modifications, focused tests, and a new review
that confirms the code does not pull Paperclip schema, internal types, private
services, branding, trademarks, or EE/private source into the product.

## Decision vocabulary

- **ADOPT-CODE**: legally copy a bounded implementation after provenance review.
- **ADAPT**: independently implement the evidenced invariant or algorithm in
  Company OS terms; copying is not implied.
- **REFERENCE ONLY**: learn from behavior and failure modes, but do not reuse the
  implementation or contract.
- **REJECT**: do not copy or make the design a Company OS dependency.

`ADAPT` is the highest decision reached in this audit. No module is approved for
immediate `ADOPT-CODE` because the useful code is coupled to Paperclip schema,
types, service composition, or product semantics.

## Module findings

### 1. Domain model — REFERENCE ONLY

Evidence:

- `packages/db/src/schema/agents.ts:14-45` stores company-scoped Agents,
  adapter/runtime configuration, budgets and permissions, but `reportsTo`
  points back to `agents.id`; this is not a mixed human/Agent organization.
- `packages/db/src/schema/issues.ts` combines goal/project hierarchy,
  assignment, responsible user, checkout, execution, monitoring and recovery
  state in one dense task record.
- `packages/db/src/schema/goals.ts` provides hierarchical company goals whose
  explicit owner is an Agent.
- `packages/db/src/schema/heartbeat_runs.ts` captures run lifecycle, responsible
  user, session transitions, usage, logs, retry, liveness and context snapshots.
- `packages/db/src/schema/approvals.ts:5-27` uses `type` plus generic JSON
  `payload`; exact work/contract/action digest/Agent/human/evidence/result
  bindings are not required columns.

Good ideas to preserve independently: stable opaque IDs, company scoping,
hierarchical goals, separate run attempts, explicit liveness and recovery
fields, budget policies/incidents, and provenance-rich artifacts.

Do not copy the schema or DTOs. Company OS owns mixed principals, human
accountability, responsibility-contract revisions, precise approval subjects,
data authorization contracts, evidence lineage, Office entities, and its own
Task/Goal/Run/Budget/Artifact/Heartbeat vocabulary.

### 2. Database, migrations and backup — ADAPT

Evidence:

- `packages/db/src/check-migration-safety.ts:14-80` classifies dangerous
  large-table loops, batched mutations without support indexes, full-table
  mutation and non-concurrent index creation.
- `packages/db/src/check-migration-safety.ts:117-199` derives stable finding
  hashes and requires explicit rule-and-reason suppression.
- `packages/db/src/migration-runtime.ts` supports external and embedded
  Postgres, but embeds Paperclip lifecycle, defaults and local-process behavior.
- `packages/db/src/backup-lib.ts` contains streaming/`pg_dump` backup,
  sanitization and retention ideas, tightly bound to its schema and CLI.
- `server/src/services/plugin-database.ts:170-243` bans high-risk plugin SQL,
  destructive mutations and cross-namespace access.
- `server/src/services/plugin-database.ts:473-550` uses an advisory transaction
  lock, ordered files, checksums, an applied/failed ledger and transaction
  boundaries.

Company OS should independently implement immutable migration checksums,
advisory locking, safety lint with justified suppressions, expand/migrate/
contract phases, backup/restore drills, rollback-compatible release metadata,
and isolated extension namespaces. It must not copy Paperclip's 210 migrations,
schema names, embedded database defaults, retention table list or restore format.

### 3. Task execution and Agent runtime — ADAPT

Evidence:

- `server/src/services/issues.ts` uses transactions, row locks, advisory locks,
  idempotency records, checkout ownership and workspace fingerprint validation.
- `server/src/services/heartbeat.ts`, `run-liveness.ts`,
  `agent-start-lock.ts` and `task-watchdogs.ts` show bounded retries,
  compare-and-set terminalization, process-loss deduplication, scheduled retry
  suppression when ownership or dependencies change, and stale-review guards.
- `server/src/services/heartbeat.ts` is over 18,000 lines at this pin and couples
  task, adapter, checkout, session, runtime, recovery, billing and event logic.
- `packages/adapter-utils/src/types.ts` provides rich adapter/session types but
  exposes Paperclip execution concepts and legacy compatibility fields.

Adopt the invariants, not the service: idempotent command acceptance; one lease
per work attempt; terminalize-before-release; monotonic attempt state; fencing
tokens; bounded retry with reason; cancel/timeout races; process-loss recovery;
secret-free runtime attestation; and immutable evidence/result references.

Company OS must keep Connector capability negotiation, vendor-neutral progress,
pause/resume/cancel/timeout/evidence/result, human approval suspension and exact
responsibility bindings as its canonical runtime contract. Paperclip adapter,
session or heartbeat types are prohibited from core/application.

### 4. API and events — ADAPT

Evidence:

- `server/src/routes/openapi.ts` is a large generated registry and covers the
  mounted non-experimental REST surface at the audited pin.
- The owned UI makes 609 source-level HTTP method calls by the audit expression,
  demonstrating broad server accessibility rather than client-only core logic.
- `server/src/errors.ts:1-38` makes status/message universal but structured
  `details.code` optional; some services compare English messages, for example
  `server/src/services/heartbeat.ts:5210`.
- `server/src/services/live-events.ts:1-54` uses one process-local
  `EventEmitter` and a memory counter, with no durable cursor or replay.
- Per-run event endpoints have stronger sequencing, but are not a general
  company event log/outbox.

Company OS should own a versioned API with stable error code plus structured
parameters, idempotency key semantics, tenant-bound cursors, optimistic version
checks and an OpenAPI/contract-test gate. Domain events must use a transactional
outbox, immutable event ID, aggregate version, tenant sequence, replay cursor,
retention declaration and projection checkpoint. WebSocket/SSE is delivery,
not the source of truth. Never translate or branch on English error strings.

### 5. Plugin SDK and adapters — ADAPT

Evidence:

- `packages/plugins/sdk/src/protocol.ts` defines versioned JSON-RPC envelopes,
  numeric machine errors, invocation metadata and a wide host-call protocol.
- `packages/plugins/sdk/src/types.ts:198-219` defines event envelopes and
  company scoping; later sections expose jobs, outbound HTTP, state and secret
  reference APIs.
- `server/src/services/plugin-capability-validator.ts:389-429` rejects unknown
  operations by default and checks declared capabilities on every operation.
- `server/src/services/plugin-manifest-validator.ts:119-160` validates a
  versioned manifest and exposes supported API versions.
- `server/src/services/plugin-runtime-sandbox.ts:107-160` uses a Node VM,
  explicit import allow-list and load timeout. A VM is useful containment but
  must not be treated as a complete hostile-code security boundary.
- `server/src/services/plugin-database.ts:190-243` confines extension SQL to a
  namespace and a small core-read allow-list.

Company OS should independently implement a small Connector wire protocol and
separate extension/plugin contract: semantic protocol version, capability
declaration, health, identity binding, input/output envelopes, idempotency,
pause/resume, cancel, timeout, evidence/result, secret references and
short-lived secret-free attestation. Unknown capabilities fail closed.

Do not copy the Paperclip Plugin SDK wholesale, its UI slots, host-client
factory, internal entity names, sandbox provider contracts or adapter session
formats. Company OS needs an explicit trust-tier model: in-process trusted,
separate-process restricted, and externally isolated execution node. Connector
messages never contain vendor credentials, raw external sessions or private
reasoning.

### 6. Identity, permissions and tenancy — ADAPT

Evidence:

- `server/src/middleware/auth.ts:165-233` supports authenticated sessions and a
  `local_trusted` implicit instance administrator. The latter is development
  convenience and unsafe as an enterprise production default.
- The same middleware binds board/Agent credentials to company access,
  validates run context and audits mismatches or missing responsible users.
- `server/src/services/authorization.ts:273-331` fails closed on policy shapes it
  cannot evaluate.
- `server/src/services/authorization.ts:298-304` explicitly states that legacy
  `requiresApproval` aliases never had an approval workflow and are hard blocks.
- `server/src/services/authorization.ts:334-365` evaluates an Agent-to-Agent
  reporting tree with a bounded depth.
- `server/src/services/access.ts` uses transactions and row locks to prevent
  removal of the last active company owner and performs work reassignment on
  membership archival.

Company OS should adapt fail-closed authorization, tenant-before-object lookup,
race-safe last-owner protection, credential/run binding, security-event audit
and structured denial codes. It must own `IdentityPort` adapters for Raft
Identity/OIDC and later SAML/LDAP, independent token audiences, human principals,
accountable-human roles, delegation, separation of duties and formal
responsibility-contract acceptance. `local_trusted` may exist only as an
explicit non-production profile with visible warnings and no network exposure.

### 7. Approvals, audit and secrets — ADAPT

Evidence:

- `server/src/services/approvals.ts:35-85` uses conditional updates so repeated
  resolution is idempotent and concurrent decisions converge.
- `server/src/services/issue-approvals.ts:20-40` rejects cross-company issue/
  approval links; `:135-170` validates all bulk links before insertion.
- `packages/db/src/schema/approvals.ts:5-27` does not enforce Company OS's exact
  approval binding; generic payload is insufficient for liability semantics.
- `server/src/services/activity-log.ts:94-202` resolves responsible-user
  attribution, redacts details, persists activity and then forwards plugin and
  live events. It is useful observability, but responsibility must not depend on
  a best-effort forwarded log event.
- `server/src/services/secrets.ts` is 4,893 lines and covers provider configs,
  user/company scope, remote imports, rotation, access events and rollback.
- `server/src/services/run-secret-redaction.ts:35-57` recursively redacts
  registered values; `:58-122` resolves only values associated with a run or
  issue. Exact-value redaction is defense in depth, not proof secrets never
  crossed an unsafe boundary.
- Secret material is represented in `company_secret_versions.material` JSON;
  the local encrypted provider and key lifecycle need an independent threat
  model before any reuse.

Company OS should implement approval subject digests as immutable required
fields, optimistic/idempotent decision semantics, approver eligibility at
decision time, expiry, supersession, evidence/result binding and append-only
responsibility events. Secrets should use provider references, envelope
encryption for the local provider, rotation/version selectors, least-privilege
delivery, short leases, access audit and redaction tests. Raw secret values,
provider sessions and credentials must never enter event payloads, evidence,
Connector envelopes or browser storage.

Do not copy the monolithic secret service or generic approval schema. Favor
smaller Company OS services with a formal threat model and injectable KMS/
vault/local-encrypted ports.

### 8. Testing, security and maintenance — ADAPT

Evidence:

- The repository has broad unit/integration/E2E/release-smoke coverage and
  separate CI workflows for PR, release verification, images and visual tests.
- Release workflows pin many actions by full SHA and split verification lanes.
- `pull_request_target` is used in `.github/workflows/commitperclip-review.yml`;
  it has explicit comments and narrow permissions but still demands continuing
  scrutiny because it handles untrusted fork metadata with a secret.
- Root dependency resolution patches `embedded-postgres` and `acpx`, creating a
  deliberate upstream-local maintenance surface.
- The exact production lock audit previously recorded 99 advisories: 1
  critical, 35 high, 53 moderate and 10 low. The critical path included `tar`
  through production dependencies; counts are pin-specific and not a claim
  about current upstream HEAD.
- The production Docker build installs four Agent CLIs with `@latest` into the
  image (`Dockerfile:79-83`), reducing reproducibility and enlarging the attack
  surface.

Company OS should adapt layered test lanes, migration safety, deterministic
release smoke, full-SHA CI actions, dependency/secret scans, SBOM, signed images,
reproducible tool versions, isolated untrusted PR workflows, backup/restore
drills and two-profile compatibility tests. It must keep a small patch ledger
only for copied code; competitive radar reviews must never become automatic
upstream merges.

### 9. Web and deployment — REJECT direct reuse; REFERENCE ONLY patterns

Evidence:

- Paperclip can run without its UI, but its React pages, API client, UI slots,
  state and terminology remain Paperclip product code.
- `Dockerfile:15-58` builds a large monorepo image; `:59-112` copies the entire
  build workspace and globally installs Agent CLIs; `:114-147` adds a distinct
  cloud target with bundled sandbox providers.
- `docker/docker-compose.yml:1-40` gives a useful Postgres health dependency and
  authenticated/private defaults, but its credentials, volumes, service shape
  and lifecycle are Paperclip-specific.
- The Web is English-first Paperclip branding and is not the warm, responsive,
  Chinese-market Company OS experience or renderer-neutral office model.

Reject page, route, API client, CSS/theme, logo, trademark and deployment-file
reuse. Company OS owns its responsive Web, design tokens, legally copied Raft
fish assets, Agent Boss information architecture, Demo boundary, Chinese-first
experience, and Pre-3D Office Compiler. It also owns one service/data model that
is composed into managed-cloud and self-hosted/local-enterprise profiles; a
later hybrid local execution node uses the neutral Connector protocol.

Useful reference patterns only: multi-stage images, non-root runtime, health
checks, explicit authenticated/private exposure, separate production/cloud
composition and release-smoke verification. Company OS images must pin all
tools, prune dev dependencies, minimize packages and produce an SBOM.

## Canonical ownership after the audit

| Production capability | Canonical owner |
| --- | --- |
| Organization, human and Agent principals | Company OS |
| Responsibility contracts and evidence chain | Company OS |
| Task, Goal, Run, Budget, Artifact, Heartbeat | Company OS |
| Approval and audit semantics | Company OS |
| Data authorization and egress firewall | Company OS |
| Identity ports and deployment adapters | Company OS |
| Connector and extension SDKs | Company OS |
| API, events, persistence and migrations | Company OS |
| Managed-cloud and self-hosted composition | Company OS |
| Agent Boss, FDE templates and Web | Company OS |
| Office Compiler and renderer contract | Company OS |
| Paperclip product behavior | Paperclip, research input only |

There is one owner per production capability. Paperclip is not a fallback
runtime and there is no dual-write, schema bridge or compatibility layer.

## Selective reuse policy and exit

1. Quarterly or milestone-based competitive radar may inspect a new stable tag.
2. A useful capability first receives a Company OS need statement and a
   `REFERENCE ONLY`, `ADAPT`, `ADOPT-CODE` or `REJECT` decision.
3. Prefer independent implementation of small invariants and tests. Copy code
   only when its bounded quality advantage exceeds the provenance and ongoing
   maintenance cost.
4. Any copy records upstream file, exact SHA, license, destination, modifications,
   verification and Company OS owner in `audit-manifest.json` and notices.
5. Copied code may not retain runtime calls or type/schema imports from
   Paperclip. No trademark, Logo, brand asset, EE/private source, migration,
   page, internal API or database contract may be copied.
6. Future Paperclip changes do not flow automatically. Company OS decides if a
   new concept belongs in its own product model and implements it on its release
   schedule.
7. Exit from any copied utility is ordinary Company OS refactoring: data and
   Connector contracts remain Company OS-owned, so no Paperclip export or
   migration is required.

## Immediate impact on Company OS implementation

Stop all Paperclip compatibility and Headless/Core Service work permanently
under ADR 0008. Continue the existing independent scaffold, neutral core,
responsibility contract, Connector SDK, deterministic Demo, design system,
Agent Boss Web and Pre-3D contracts.

Before formal 3D asset production, Company OS still needs its owned durable work
model and persistence/migrations, versioned API/outbox, production identity and
authorization, exact approval/evidence chain, secret/model/data governance,
Connector runtime lifecycle, FDE templates, both deployment profiles, responsive
E2E coverage and frozen Office Compiler/renderer contracts. Paperclip types or
services must not be used to accelerate any of these deliverables.

## Verification commands

The Company OS research boundary is checked with:

```sh
npm run check:independence
npm run check:research
npm run verify
```

The source audit used read-only `git ls-files`, `git log`, `rg`, `sed`, `wc` and
package metadata inspection. No Paperclip script was trusted as proof of Company
OS correctness, and no source file in the research checkout was modified.
