# Company OS Alpha requirement traceability

Date: 2026-09-05  
Status: approved implementation control document; execution in progress

This matrix prevents a green build or a visually polished happy path from being
mistaken for a complete Alpha. A requirement is complete only when its named
authoritative evidence exists and contradicting evidence has been resolved.

## Product requirements and proof

| ID | Requirement | Implementation owner | Required authoritative evidence | Current state |
|---|---|---|---|---|
| A-01 | Agent may be created before a Runtime exists | Agent identity/application | Agent-first browser journey persists `DRAFT_UNBOUND` across reload | Complete; formal E2E creates unbound first |
| A-02 | Runtime may be registered before an Agent exists | Runtime registry | Runtime-first browser journey persists a registered healthy Runtime | Complete in formal E2E |
| A-03 | Agent and Runtime can be bound later without profile mutation | Agent-runtime binding | revisioned bind API, event, projection, conflict tests, browser proof | Complete; domain/API/Web/E2E evidence |
| A-04 | Rebind/unbind is safe with active or uncertain Work | Agent-runtime binding + Work | active/unknown Work denial or admitted drain policy; no orphaned authority | Complete; non-terminal Attempt denial tests |
| A-05 | Readiness explains every missing prerequisite | Agent dossier | projection and screenshot for each blocker, with reachable next action | Complete for Alpha; formal 1/4→4/4 journey and six three-viewport screenshots retained |
| A-06 | One canonical Agent dossier is reachable everywhere | Web IA | Agents/Organization/Work/Approval/Alert/Case/Runtime link tests | Complete for Alpha; Agents, Organization, Runtime, Work, Approval, and AI Case converge on one dossier; Alert reaches its Case |
| A-07 | Identity and tenancy fail closed | identity adapters/application | role and wrong-tenant API/browser negative cases | Existing; extend for new commands |
| A-08 | Responsibility precedes execution | responsibility/application | missing/stale contract denial and activation journey | Existing; integrate into readiness |
| A-09 | Permission, tool, data and Secret authority is explicit | governance/application | exact authority snapshot and blocked-state browser evidence | Complete for Alpha; Agent dossier exposes effective scope and Work shows exact references or explicit default-deny/no-contract truth |
| A-10 | Work/Attempt/Run remains durable execution truth | Work application | restart, idempotency, cancel, timeout, unknown outcome, safe retry | Existing; extend binding revision |
| R-01 | Runtime observations include bounded Trace/Span facts | observation domain/port | schema validation, ingestion limits, projection, real Connector trace | Complete for Alpha; real HTTP Codex completion emits a validated Attempt-bound Runtime Trace |
| R-02 | Tool and data access are visible without raw secret/session content | observation + governance | rejection tests for forbidden fields; admitted references/digests | Complete for Alpha; adapter limits and admission tests retain bounded references/digests and reject malformed traces |
| R-03 | Policy violations become actionable alerts | risk application | deterministic rule-to-alert integration and browser evidence | Complete for Alpha; tenant-versioned rules, deterministic alert pipeline, and three-viewport evidence retained |
| R-04 | Access Map explains the exact authority path | access projection | subject-to-resource path with policy/grant/evidence links | Complete for Alpha; exact subject/resource/operation/authority path is tested and shown in responsive evidence |
| R-05 | Containment uses only declared Connector capabilities | risk + connector command | capability-negative tests and real pause/resume proof | Complete for Alpha scope; durable outbox confirmation plus a real authenticated HTTP Agent Node/Codex `WORKING→AWAITING_APPROVAL→WORKING→COMPLETED` run are retained |
| R-06 | AI Case closes the incident lifecycle | case domain/application | contain, assign, investigate, remediate, review, recover, close/reopen tests | Complete for Alpha; authorized API/Web command loop, recovery confirmation, and three-viewport evidence retained |
| G-01 | Unified AI assets cover Model/Prompt/Dataset/Tool/MCP/Workflow/KB | AI asset graph | CRUD/sync/version/provenance projection and browser dossier | Complete for Alpha; revisioned registry, bounded Trace discovery, strict API, edit/relationship dossier, and responsive evidence complete; production sync is not claimed |
| G-02 | Asset impact is navigable | graph projection | changed version to affected Agent/Run/Policy/Case path | Complete for Alpha; goals, projects, dependencies, Runs, Policies, evaluations, and AI Cases are linked from the asset dossier |
| E-01 | Evaluation templates/datasets/scores/trends are evidence-backed | evaluation domain | score provenance, threshold/regression tests, trend UI | Complete for Alpha scope; strict API/Web, frozen evaluator provenance, thresholds, regression and unavailable states tested |
| V-01 | Cost/adoption/value is verifiable | value application | source, period, method, confidence, unavailable-state tests | Complete for Alpha scope; verified-only API/Web totals exclude estimates and withhold net value for missing outcome or unpriced cost |
| V-02 | Goals/projects/assets/budgets are linked without full SPM/PPM | planning projection | link validation and portfolio browser journey | Complete for Alpha; navigable goal/project links and verified value join canonical cost without full SPM/PPM |
| S-01 | Shadow AI is an intake and resolution workflow, not invented control | discovery/risk | discovered/unmanaged state, owner assignment, connector admission | Complete for Alpha; bounded Trace intake plus revisioned assign/admit/reject API/Web journey; unconnected control is never claimed |
| S-02 | Duplicate review preserves history | asset governance | match evidence, merge/retire decision, historical reference tests | Complete for Alpha scope; evidence-backed review and history-preserving merge/dismiss API/Web workflow tested |
| U-01 | No primary information or action is hidden at 390/768/1440 | Web layout | current-run screenshots plus covered-element/truncation assertions | Complete for Alpha; all 17 accepted pages plus expanded Agent, task, AI control, and risk surfaces pass three widths |
| U-02 | Dialogs/sheets remain usable with keyboard and screen reader | Web components | focus trap/return, Escape, labels, viewport bounds, action reachability | Complete for Alpha; dialog bounds, action reachability, Escape, focus return, and keyboard focus pass three widths |
| U-03 | Fixed navigation never covers content or focus | Web shell | safe-area and intersection assertions on long/detail pages | Complete for Alpha; mobile navigation reserve and interactive-element bounds pass all accepted pages |
| U-04 | Every visible control is real or truthfully blocked | Web/application | control inventory mapped to operation or stable blocked reason | Complete for Alpha; interaction guard covers seven customer-surface files and browser journeys exercise primary operations |
| Q-01 | Demo and Formal truth remain separate | composition/Web | no formal mutation from Demo; no fixture claims in Formal | Complete for Alpha; full page matrix and formal journeys preserve explicit Demo labels and formal mutation boundaries |
| Q-02 | Real non-Fixture Connector passes end to end | Connector/acceptance | customer-authorized or project-owned non-Fixture trace, work, evidence, recovery | Complete for project-owned Alpha scope; local authenticated HTTP Agent Node executed real Codex, pause/resume and evidence/usage admission. Customer staging and enterprise data remain explicitly unclaimed |
| Q-03 | Alpha release is immutable and reproducible | release pipeline | full verify, manifest, SBOM, image digests, release CI, rollback evidence | Pending final phase |

## Phase 1 change map

The first implementation phase is intentionally narrow in architecture but
complete as a user journey.

| Layer | Expected change | Constraint |
|---|---|---|
| `core` | define neutral `AgentRuntimeBinding`, statuses, transition validation and readiness facts | no HTTP, Web, database, vendor, Raft, Codex, Nostr or relay vocabulary |
| `ports` | binding store/command boundary using core types | imports `core` only |
| `application` | bind, rebind and unbind use cases; active-Work and lifecycle guards; readiness projection | no adapter/Web imports; optimistic revision and actor identity required |
| `adapters/storage` | event-backed binding persistence and replay | append-only history; no silent migration of existing runtime fields |
| `adapters/http` | validated versioned endpoints and stable error mapping | tenant/role/origin/input checks; no raw credentials |
| `web/application-client.ts` | formal client methods and response admission | mutation has no implicit retry; Demo remains explicitly unavailable or deterministic |
| `web/pages` / `web/mount.ts` | one Agent dossier, binding review, readiness checklist and reciprocal Runtime attachment | same command from every entry; no duplicate business state |
| `web/styles.css` | responsive dossier/sheet, safe bottom spacing, lossless mobile rows | 390/768/1440 plus zoom/long-content checks |
| `tests` | domain, application, HTTP, client, browser, accessibility and visual-state coverage | negative cases are first-class, not only happy-path snapshots |
| `docs/adr` | binding authority, migration and compatibility decision | old `runtimeConnectorId` reads remain explainable during migration |

## Phase 1 command contract candidate

This is a planning contract, not implemented API.

```text
POST /api/v1/companies/{companyId}/agents/{agentId}/runtime-bindings
  connectorId
  expectedAgentRevision
  expectedBindingRevision
  expectedConnectorRevision
  reason

POST /api/v1/companies/{companyId}/agents/{agentId}/runtime-bindings/{bindingId}/unbind
  expectedBindingRevision
  activeWorkDisposition
  reason
```

The server resolves the authenticated human and records it; the browser cannot
supply or impersonate the actor. Capability digest, health, residency and
Connector revision are server-derived at decision time. Rebinding creates a new
binding revision rather than rewriting historical Work authority.

## Phase 1 mandatory negative cases

1. Unknown, disabled, unhealthy, wrong-company or stale-revision Runtime.
2. Agent not found, terminated, pending frozen configuration, or wrong company.
3. Viewer/operator without required authority and Agent self-approval.
4. Active Work, approval-pending Work and `OUTCOME_UNKNOWN` Work.
5. Connector capability digest changed between review and commit.
6. Duplicate replay with the same idempotency key and conflicting replay body.
7. API interruption before response, followed by authoritative reload.
8. Demo attempt to claim a real binding.
9. Long Agent/Runtime names, multilingual content, 200% zoom and software keyboard.
10. Bottom navigation, sticky actions or error banners covering focused content.

## Release evidence index

The following evidence paths are reserved and must be populated by the matching
phase. A missing file means the requirement is not complete.

```text
docs/acceptance/alpha/
  phase-1-agent-runtime-binding.json
  phase-1-responsive-accessibility.json
  phase-2-runtime-governance.json
  phase-2-real-connector.json
  phase-3-ai-asset-evaluation.json
  phase-4-cost-value.json
  phase-5-case-shadow-duplicate.json
  phase-6-full-verification.json
  phase-6-release-publication.md
```

Screenshots belong under one immutable per-release directory and must identify
route, state, viewport, language, role, data mode, and expected primary action.
