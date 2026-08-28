# ANC Agent Portfolio gap analysis

Date: 2026-08-27  
Baseline: `v0.1.0-rc.5` / commit `5ce7173`  
Scope: retain, extend, and migrate current Company OS into the ANC multi-layer
Agent management and governance product.

## Executive finding

The repository already contains most of the difficult Governed control-plane
foundation. The correction is an additive Portfolio model, not a rewrite. The
largest mismatch is that current Agent, Work, and Connector contracts assume an
ANC-dispatched executable Agent. They cannot truthfully represent an
inventory-only Personal Agent, a source-owned Observed task, or a federated
platform that owns execution.

## Retain without semantic downgrade

| Capability | Current evidence | Decision |
|---|---|---|
| Company, department, human, Agent | `core/organization.ts`, company structure and membership services | Retain IDs and relationships; extend Agent metadata additively. |
| Accountable human and responsibility contract | `core/responsibility.ts`, responsibility registry and transfer flows | Retain as canonical for Governed Work; expose gaps for non-governed records. |
| Goal, Project, Work, Attempt | planning, `core/work.ts`, `core/work-attempt.ts` | Retain Governed semantics; add source/mode projection rather than weakening validation. |
| Approval, Evidence, Result | exact-action approval, evidence projections, accountability export | Retain unchanged for Governed records; never synthesize for Observed/Federated. |
| Event Store, Projection, Outbox | durable stores, checkpoints, redrive, replay tests | Reuse for all new portfolio records and idempotency. |
| Connector SDK and HTTP nodes | SDK envelopes/conformance, HTTP Agent/Data/Secret packages | Preserve v1 execution compatibility; extend capability vocabulary. |
| OIDC and membership | formal access status, session identity, Keycloak/Dex gates | Formal mode remains fail-closed; add a separate Demo Session identity boundary. |
| Model/data/Secret/budget governance | route, data authorization/egress, opaque Secret references, usage budgets | Reuse; add commercial and credential-status projections without Secret values. |
| Deployment and operations | six-image RC4/RC5, sites, prepare-only, migration, backup/restore, upgrade/rollback | Immutable baseline; new Demo Profile and next RC only. |
| Web/i18n/design | owned shell, operational pages, interaction checks, zh-CN/en | Reuse layout and visual system; change object hierarchy and copy. |

## Extend

| Area | Current state | Required extension |
|---|---|---|
| Agent taxonomy | `AgentDraft` has role, department, accountable human, runtime Connector, avatar, autonomy | Add class, management depth, execution owner, provider/runtime refs, external identities, source, visibility, privacy boundary, sync state. |
| Agent lifecycle | lifecycle focuses on executable Agent approval/pause/run/error/terminate | Add portfolio request/enable/suspend/transfer/retire semantics while preserving governed execution state. |
| Connector capabilities | catalog requires `SUBMIT`, `PROGRESS`, `RESULT`; pause/resume is paired | Separate readable data from enforceable controls; allow Inventory, usage, Observed, and Federated sync without execution. |
| Work source | `WorkDraft` requires company human initiator, active responsibility contract, allowed actions, runtime Connector | Add cross-source Work envelope with Observed/Governed/Federated mode, external ID, channel/thread/workspace, return link, sync state. |
| Usage | request/run usage and budgets already exist | Add idempotent external usage import and employee/Agent/department/provider allocation. |
| Commercial state | billing type exists on usage | Add subscription, seat, quota, renewal date/request, and commercial anomaly records. |
| Credential state | opaque Secret reference lifecycle exists for execution | Add non-secret Token/credential reference status, expiry, verification, and renewal policy projection. |
| External identity | formal human membership and Agent IDs are internal | Add neutral external principal/Agent/workspace mappings scoped to Connector/source. |
| Demo | deterministic Demo runtime and fixture provenance already exist | Add server-owned per-visitor session isolation, Portfolio fixture, renewal flow, concurrent isolation, reset generation, and route segregation. |
| Web | Agent Boss and governed operational pages dominate | Reframe Dashboard/Agents/Work/Approvals/Governance/Usage around Portfolio and management depth. |

## Migrate compatibly

| Existing record | Compatibility mapping |
|---|---|
| Existing Agent with runtime Connector | `SHARED` + `GOVERNED` + `ANC_CONNECTOR`, unless an explicit migration override says otherwise. |
| Existing full execution Connector | Governed data/control capability set derived from v1 operations; protocol v1 remains accepted. |
| Existing Work/Attempt | Work mode `GOVERNED`, source `ANC`, execution owner `ANC_CONNECTOR`; responsibility/evidence remain unchanged. |
| Existing usage event | Preserve source values; attach allocation dimensions only when deterministically resolvable. |
| Existing Secret reference | Preserve lifecycle and material boundary; credential-status view references it without copying material. |
| RC4/RC5 backup/export | Schema-versioned migration must replay or inspect it without mutating the source artifact. |

## New contracts required

1. Agent Portfolio registration/update and projection.
2. External identity/source reference mapping.
3. Connector capability catalog v2 with v1 compatibility.
4. Idempotent Observed Work registration.
5. Governed Work entry using the existing formal path.
6. Monotonic Federated directory/workspace/Work/Run/artifact sync.
7. Idempotent usage import and allocation.
8. Subscription, quota, seat, credential status, and renewal request lifecycle.
9. Isolated Demo Session create/read/reset/recover boundary.
10. Dashboard/Agents/Work/Governance/Usage Portfolio projections.

## Explicit non-goals

- No external platform workspace, memory, sandbox, filesystem, or native UI.
- No capture of Personal Agent private tasks, sessions, conversations, files, or
  reasoning.
- No universal ANC task dispatch requirement.
- No real external Connector or paid model call in the exhibition Demo.
- No server start, formal data initialization, DNS/TLS change, tag, image
  publication, or Hong Kong mutation without separate authorization.
- No deletion or replacement of RC4/RC5 or prepare-only evidence.

## Risk register

| Risk | Guardrail |
|---|---|
| UI overstates governance | Management depth and individual capability facts are mandatory in every Agent/Work projection. |
| Personal privacy leakage | No Personal task ingestion route; allow-list inventory fields; adapter input limits. |
| Federated replay or source rollback | Company/source/external ID idempotency plus monotonic cursor/revision. |
| Demo becomes an auth bypass | Separate route composition and identity type; formal middleware explicitly rejects Demo identity. |
| Migration weakens governed responsibility | Existing Work maps only to Governed; current exact approval/evidence tests remain unchanged. |
| Vendor leakage inward | Boundary check expands forbidden vocabulary and imports; fixtures/adapters alone name sources. |
| Release evidence overwritten | Additive migrations and new candidate ID; RC4/RC5 artifacts are read-only inputs. |

## First vertical slice boundary

The first code increment should prove one complete neutral path before broad UI
work: validate all three Agent classes and capability combinations, persist a
Portfolio snapshot, register one Observed Work idempotently, synchronize one
Federated Work without dispatch, and project both beside an unchanged Governed
Work. Commercial records and Demo isolation follow as separate verified slices.

## Implemented status

The vertical slice is now implemented on `codex/anc-agent-portfolio` without
rewriting the retained control plane:

- neutral Agent Portfolio validation and durable formal synchronization;
- Connector capability v2 and SDK records while v1 execution remains valid;
- idempotent Observed Work and monotonic Federated Work synchronization;
- subscription, credential-reference status, usage allocation, and renewal;
- isolated, expiring, resettable public Demo Sessions and formal-route denial;
- bilingual responsive Portfolio pages and the approval/renewal/reset journey;
- explicit `COMPANY_OS_PUBLIC_DEMO_ENABLED` opt-in, defaulting to disabled.

The event additions use the existing append-only event store, so this slice
does not require a destructive SQL shape change. The RC6-to-RC7 release plan
confirmed PostgreSQL 16, `EXACT_PREFIX` migration history, no added migration,
and unchanged public contracts without connecting to or mutating a database.
RC7 publication, six immutable image digests, and the Hong Kong prepare-only
install are recorded in
[`../acceptance/2026-08-27-anc-agent-portfolio-hk-rc7-candidate.json`](../acceptance/2026-08-27-anc-agent-portfolio-hk-rc7-candidate.json).
Runtime start, traffic, and target-host browser acceptance remain deliberately
open and must not be inferred from candidate installation.
