# Company OS Alpha product blueprint

Date: 2026-09-05  
Status: approved; implementation in progress

Requirement-level ownership and proof are tracked in
[`company-os-alpha-traceability.md`](company-os-alpha-traceability.md). The
blueprint cannot be declared complete from phase summaries alone.

## Goal

Deliver a genuinely usable Company OS Alpha in which a company can inventory,
connect, govern, observe, evaluate, and safely operate AI Agents through one
coherent control plane. Every visible control must either complete a real,
authorized operation or present a truthful blocked state with a valid next step.

Completion requires one real non-Fixture Connector journey, current-run journey
screenshots at 390/768/1440 widths, keyboard and accessibility checks,
`npm run verify`, and an immutable Alpha RC release.

## Product boundary

The ServiceNow comparison is a capability benchmark, not a mandate to clone its
navigation or breadth. Alpha includes the parts that strengthen ANC:

- unified AI assets and relationships;
- runtime observation and evaluation;
- Access Map, policy violations, alerts, risk response, and AI Cases;
- responsibility, approvals, evidence, permissions, data, and cost/value;
- Shadow AI and duplicate-review signals where evidence is available.

Alpha does not include a generic CMDB, full SPM/PPM/RIDAC suite, irrelevant
regulatory packs, unverifiable ROI, copied ServiceNow tab sprawl, private Agent
reasoning/session ingestion, or many shallow Connectors.

## Information architecture

| Group | Surface | Primary question |
|---|---|---|
| Operate | Home / Inbox | What needs attention now? |
| Operate | Work | What is running, blocked, completed, or uncertain? |
| Operate | Approvals | Which exact high-risk action needs a human decision? |
| Assets | Agents | Which Agents exist, who owns them, and are they runnable? |
| Assets | AI Assets | Which models, prompts, datasets, tools, MCP servers, workflows, and knowledge sources are used? |
| Assets | Runtimes | Which Connector endpoints are discovered, registered, healthy, and assigned? |
| Govern | Risk & Access Map | What can access what, which policy was violated, and what is the blast radius? |
| Govern | Evaluations | Is behavior safe, useful, timely, and improving? |
| Govern | AI Cases | How is an incident contained, owned, remediated, reviewed, and closed? |
| Manage | Organization & Responsibility | Which human is accountable for each Agent, goal, project, decision, and result? |
| Manage | Usage & Value | What verified cost, adoption, output, and value evidence exists? |
| Manage | Settings | How are identity, deployment, retention, export, and security configured? |

The current “接入与治理” mega-page is split into Runtimes, AI Assets, and Risk &
Access Map. Governance facts remain linked, but users no longer have to understand
all catalogs to complete one onboarding task.

## Canonical object model

The inward layers remain vendor-neutral and preserve
`core <- ports <- application <- adapters/web`.

| Object | Owns | Key relationships |
|---|---|---|
| Agent | stable enterprise identity, class, role, lifecycle | human, department, runtime binding, assets, policies, work |
| RuntimeConnector | capability declaration, residency, health, control authority | bindings, observations, commands |
| AgentRuntimeBinding | revisioned relationship and readiness decision | one Agent, one RuntimeConnector, reviewer, capability digest |
| AIAsset | Model, Prompt, Dataset, Tool, MCP, Workflow, Knowledge Base inventory | Agent, runtime, owner, policy, version |
| Work / Attempt / Run | requested outcome and durable execution truth | Agent, binding revision, authority snapshot, trace, result |
| Observation / Trace / Span | bounded runtime telemetry | work/run, tool, data access, latency, quality, source |
| PolicyViolation / Alert | detected rule breach and actionable signal | Agent, asset, observation, access path, severity |
| AccessMapEdge | why one subject may access one resource | policy, grant, data contract, tool binding, evidence |
| AICase | incident coordination and closure | alerts, owner, containment, root cause, remediation, review |
| Evaluation | template, dataset, score, threshold, trend | Agent, asset version, run, evidence |
| CostValueRecord | verified cost/adoption/output/value evidence | Agent, team, project, goal, source |

Vendor names, transport details, private credentials, and raw private sessions
remain in adapters and Connector packages.

## State machines

### Runtime

`DISCOVERED -> REGISTERED -> VERIFYING -> HEALTHY`

From any active state it may become `DEGRADED`, `UNREACHABLE`, `DISABLED`, or
`REVOKED`. Recovery always re-verifies identity, capability digest, residency,
and health; it never silently restores authority.

### Agent and binding

`DRAFT_UNBOUND -> BOUND_UNVERIFIED -> READY -> PAUSED -> READY -> TERMINATED`

- Creating an Agent first is valid and produces `DRAFT_UNBOUND`.
- Registering a Runtime first is also valid.
- The two are matched by explicit stable IDs through `AgentRuntimeBinding`.
- Binding/rebinding is a reviewed command with expected revision, initiator,
  reason, capability digest, and audit event.
- Rebinding an Agent with active Work is blocked or requires a separately defined
  drain/cancel policy; no profile edit may change the runtime.
- `READY` additionally requires an accountable human, active responsibility
  contract, enabled healthy Runtime, admitted permissions/data/tool policy, and
  any required model/Secret references.

### Risk closure

`OBSERVATION -> POLICY_VIOLATION -> ALERT -> CONTAINMENT -> AI_CASE -> REVIEW -> RECOVERY -> CLOSED`

Containment may pause an Agent or exact Work/Attempt only when Connector
capabilities support it. Every automatic or human action records reason,
authority, evidence, and outcome.

## The Agent onboarding journey

The UI uses one resumable journey instead of requiring a fixed creation order:

1. Add or discover the Agent identity.
2. Assign accountable human and department.
3. Choose an existing Runtime, or select “connect later”.
4. If no Runtime exists, launch Runtime discovery/registration and return to the
   same Agent automatically.
5. Review the proposed Agent-runtime binding, capabilities, residency, and risk.
6. Configure required model/tool/data/Secret references without exposing values.
7. Activate responsibility and policy contracts.
8. Run a bounded connection test and show evidence.
9. Mark the Agent Ready, or show an exact checklist of remaining blockers.

The inverse path also works: Runtime detail can choose “Attach Agents” and opens
the same binding review. Both paths write the same command and event.

## Delivery plan

Implementation is vertical: each phase ends in a browser-usable journey rather
than isolated backend layers.

### Phase 0 — architecture and UX contract freeze

Deliverables:

- approve this blueprint and the current-run audit;
- create ADRs for `AgentRuntimeBinding`, AI Asset Graph, runtime telemetry, and AI
  Case boundaries;
- define shared dossier, relationship-link, readiness-checklist, responsive
  sheet, status, empty/error/blocked, and action-feedback UI contracts;
- convert route/control coverage into a journey/state/viewport acceptance matrix.

Exit criteria:

- no unresolved ownership or dependency-direction decision;
- every Alpha capability has one canonical object, command owner, page, and test;
- all out-of-scope ServiceNow capabilities are explicitly recorded.

### Phase 1 — repair the core Agent journey (P0)

Deliverables:

- revisioned bind/rebind/unbind application command and HTTP contract;
- unified Agent dossier linked from Agents, Organization, Work, Approvals, Alerts,
  Cases, and Runtimes;
- resumable create-first or runtime-first onboarding;
- readiness checklist and actionable blocked states;
- mobile bottom-nav safe area, lossless Agent rows, responsive dossier/sheet,
  tabs and dialog fixes.

Tests and acceptance:

- Agent-first late binding and Runtime-first attachment both reach `READY`;
- conflict, disabled/unhealthy Runtime, active Work, missing responsibility,
  unauthorized actor, and stale revision fail visibly and safely;
- no hidden/covered primary information or actions at 390/768/1440;
- full keyboard traversal, focus return, Escape/close, and screen-reader names.

### Phase 2 — runtime governance closed loop (P0)

Deliverables:

- Trace/Span/tool-call/data-access observation contracts and bounded ingestion;
- PolicyViolation, Alert, and Access Map projections;
- Agent dossier health, latency, failure, quality, security, and latest-run facts;
- signal-to-pause-to-Case-to-review-to-recovery workflow;
- Connector capability truthfulness for observe/pause/resume/cancel/result.

Tests and acceptance:

- one real non-Fixture Connector produces a trace and admitted evidence;
- a deterministic violation identifies the exact access path, pauses only the
  supported target, opens a Case, assigns a human, and recovers after review;
- unsupported controls render unavailable rather than simulated.

### Phase 3 — unified AI Asset Graph and evaluations (P1)

Deliverables:

- Model, Prompt, Dataset, Tool, MCP, Workflow, and Knowledge Base inventory;
- version/provenance/owner/policy relationships;
- evaluation templates, datasets, scores, thresholds, regressions, and trends;
- impact view from changed asset to affected Agents, Work, policies, and Cases.

Tests and acceptance:

- an operator can answer which version an Agent used and which runs were affected;
- an evaluation regression creates a bounded alert with evidence;
- raw secrets, private reasoning, and unsupported provider claims are rejected.

### Phase 4 — strategy, cost, adoption, and value (P1)

Deliverables:

- connect goals/projects/assets/budgets without recreating SPM/PPM;
- verified cost and adoption by Agent/team/project/provider;
- value records requiring source, method, period, and confidence;
- explicit unavailable/unverified states instead of invented ROI.

Tests and acceptance:

- every displayed metric traces to admitted source evidence;
- budget and anomaly actions link to the responsible Agent, Work, owner, and Case.

### Phase 5 — operational governance extensions (selected P2)

Deliverables:

- AI Case root cause, remediation, prevention, post-review, and reopen lifecycle;
- Shadow AI discovery intake and ownership resolution;
- duplicate Agent/asset review and governed merge/retire decisions;
- optional regulatory packs only after a named customer requirement.

Tests and acceptance:

- discovery never invents control over an unconnected system;
- merge/retire preserves historical responsibility and evidence;
- regulatory claims are traceable to an approved pack/version.

### Phase 6 — Alpha hardening and immutable release

Deliverables:

- complete route × state × role × viewport matrix;
- real-Connector end-to-end evidence, restart/recovery, cancellation, timeout,
  safe retry, isolation, and retention checks;
- accessibility and keyboard audit, visual regression baselines, performance and
  security budgets;
- migration, backup/restore, rollback, release manifest, SBOM, signed images, and
  immutable Alpha RC publication.

Exit criteria:

- `npm run verify` passes;
- no P0/P1 journey, layout, accessibility, security, data-truthfulness, or
  recovery defect remains;
- production/customer-only gates remain clearly separated from Alpha claims.

## Cross-cutting acceptance matrix

Every primary journey must be exercised in these states:

- loading, empty, success, blocked, permission denied, validation error, offline,
  retry/recovery, stale revision, partial Connector capability, Demo fixture, and
  Formal;
- owner/admin/operator/viewer and wrong-tenant access;
- 390 px phone, 768 px tablet, and 1440 px desktop;
- keyboard-only and screen-reader semantics;
- fresh session, reload, API restart, and idempotent replay where relevant.

Visual acceptance is not `scrollWidth` alone. It also fails when text required for
a decision is truncated, a fixed element covers content, a dialog exceeds the
visual viewport, focus is obscured, an action is unreachable, or state is
distinguishable only by color.

## Sequencing and stop gates

- Phase 1 begins only after the user approves this blueprint.
- Later phases may refine copy and presentation, but cannot bypass the canonical
  object/state contracts established in Phase 0.
- Stop for confirmation before using production/customer credentials or data,
  paid external resources, changing public traffic/DNS/TLS, or expanding the
  product beyond the boundary above.
- Release occurs only after all accepted changes are combined and the immutable
  candidate passes the complete verification chain.
