# Paperclip UI extraction: organization and agents

Status: source and rendered-page evidence complete; Company OS adaptation in progress.

## Evidence pin

- Upstream checkout: `213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`
- Upstream tag: `v2026.817.0`
- License: MIT (audit/reference only; no Paperclip page code is copied)
- Rendered pages inspected on 2026-08-24 from the local upstream service.

Valid captures:

- `docs/audits/2026-08-24-paperclip-ui-extraction/05-agents-list.png`
- `docs/audits/2026-08-24-paperclip-ui-extraction/06-agent-org.png`
- `docs/audits/2026-08-24-paperclip-ui-extraction/07-new-agent.png`
- `docs/audits/2026-08-20-paperclip-page-atlas/reference/desktop-agent-detail.png`
- `docs/audits/2026-08-20-paperclip-page-atlas/reference/mobile-agent-detail.png`

The old full-page Storybook management matrix is excluded from visual comparison. It is a multi-state QA canvas, not a product page.

## Route and source map

| Page | Route | Primary source | Supporting source / API |
|---|---|---|---|
| Agent list | `/agents/:tab` under the selected company | `ui/src/pages/Agents.tsx` | `ui/src/api/agents.ts`, `ui/src/components/AgentActionButtons.tsx` |
| Agent reporting view | list-page org toggle | `ui/src/pages/Agents.tsx` | `GET /companies/:companyId/org` |
| Full organization chart | `/org` under the selected company | `ui/src/pages/OrgChart.tsx` | `ui/src/api/agents.ts` |
| New Agent | `/agents/new` | `ui/src/pages/NewAgent.tsx` | `ui/src/lib/new-agent-hire-payload.ts`, trust-policy helpers, adapter registry |
| Agent detail | `/agents/:agentId/:tab?` | `ui/src/pages/AgentDetail.tsx` | Agent APIs, heartbeat APIs, issues, skills, tools, audit, budget |

`ui/src/App.tsx` owns the route table. Unprefixed legacy URLs redirect into the selected company. The failed `/org` audit capture was replaced because Paperclip interpreted it as a company prefix rather than the organization page.

## Page functionality

### Agent list

- Filters: All, Active, Paused, Error, and optionally Built-in.
- Hides terminated and pending-approval agents from the operational roster.
- Toggles between dense list and reporting-tree views.
- Shows name, role/title, runtime status, live run, configured model, adapter, execution environment and last heartbeat when space allows.
- Supports star/join/leave membership actions and lifecycle actions such as heartbeat, pause and resume.
- Empty states distinguish no agents from no agents matching a filter.
- Polls shared live-run state instead of issuing one timer per row.

### Organization chart

- Uses the Agent `reportsTo` graph only; it is not a human-company organization model.
- Lays out cards and SVG reporting edges in a pan/zoom/pinch canvas.
- Provides zoom in, zoom out and fit-to-screen.
- Links every node to Agent detail.
- Offers company import/export actions.
- Surfaces status, role/title, adapter and short description.

### New Agent

- Collects name, title, role and manager (`reportsTo`).
- The first Agent is forced into a CEO-shaped root role in the inspected implementation.
- Selects a trust preset and derives permissions/authorization policy.
- Selects adapter, environment, model/profile and adapter-specific configuration.
- Can test the execution environment before hiring.
- Can assign optional company skills.
- `POST /companies/:companyId/agent-hires` may return a pending approval as well as the Agent.

### Agent detail

Header actions include Assign Task, Run Heartbeat, Pause/Resume and an overflow lifecycle menu. The page exposes these tabs:

| Tab | Function |
|---|---|
| Dashboard | latest/live run, 14-day activity, task status, success rate, recent tasks, token and cost totals |
| Instructions | managed/external instruction bundle and instruction files for capable local adapters |
| Skills | desired/detected skill state and synchronization |
| Configuration | identity/configuration, trust and permissions, adapter settings, API keys, revision history and rollback |
| Tools | installed/permitted tool access |
| Runs | run list/detail, logs/events, usage and runtime state |
| Audit | Agent-scoped audit feed |
| Budget | Agent budget policy and hard limit controls |

Exceptional states are first-class: pending board approval, paused escalation path, invalid reporting chain, runtime error, no recent task, empty run history, unsaved configuration, failed adapter test and unsupported instruction bundles.

## API and lifecycle observations

The inspected UI consumes structured endpoints rather than deriving the full Agent lifecycle from labels. Important calls include:

- list, org, get, hire and update;
- permissions, pause, resume, clear-error, approve, terminate and delete;
- runtime state, task sessions, reset session, wakeup and heartbeat invoke;
- skills snapshot/sync;
- instruction bundle/file read-write-delete;
- adapter model/profile discovery and environment test;
- scoped Agent keys;
- configuration revisions and rollback.

Good patterns to retain conceptually are shared live-run polling, explicit exceptional states, reversible configuration revisions, environment testing before activation, and one detail surface joining work/runtime/cost/audit context.

## Company OS product conflicts

Paperclip's Agent-only organization and first-Agent-as-CEO semantics conflict with the Company OS charter:

- a legal/accountable human, not an Agent, owns organizational responsibility;
- departments, human principals and Agent colleagues are separate domain objects;
- an Agent must bind to an accountable human, department, autonomy level, permissions and data contracts;
- Connector vendor/session details cannot become the Agent's domain identity;
- high-risk approval binds an exact action and responsibility contract, not merely an Agent lifecycle state;
- Demo Agent setup must not require a model, credential or environment test;
- formal-mode identity, Connector and authorization binding must remain explicit.

## Accepted Company OS mapping

| Paperclip interaction problem | Company OS implementation |
|---|---|
| Quickly scan the operational Agent roster | One organization workspace with Structure, Humans and Agents views |
| See manager/report relationships | Department + accountable-human hierarchy; Agent nodes always hang from a human responsibility owner |
| Add an executable worker | Add Agent flow captures department, accountable human, autonomy and Connector state; Demo defaults are visibly fixtures |
| Inspect one Agent deeply | Company OS Agent detail projection: overview, responsibility, permissions/data, work/evidence, runtime and audit |
| Avoid unsafe activation | Formal Agent remains unbound/inactive until identity, Connector and authorization contracts are valid |
| Recover from runtime/config failure | Structured health state, pause/cancel, configuration revision and evidence-backed incident view |

## What is not copied

- Paperclip navigation, page components, Tailwind classes, brand, icons and prose.
- Agent-as-CEO role semantics.
- Paperclip shared types, adapter registry, API client or database identifiers.
- Vendor-specific session data, credentials, instruction internals or English error strings as contracts.

The visual implementation uses Company OS's own Generator-derived component grammar and Raft/Company OS tokens recorded in `docs/source-manifest.md`.
