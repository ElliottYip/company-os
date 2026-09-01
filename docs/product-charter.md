# ANC / Company OS product charter

Status: Active product constitution  
Last updated: 2026-08-27

## Product thesis

ANC is the enterprise management and governance layer between companies,
humans, Agents, model providers, and external Agent platforms. The repository
and deployable product remain named Company OS; ANC is the product model, not a
second codebase or a vendor-specific runtime.

ANC is not an Agent frontend, chat client, IDE, replacement for a federated
workspace, or the only Agent runtime. It is the enterprise system of record for
Agent identity, ownership, authority, data access, usage, cost, subscriptions,
credential-reference status, lifecycle, approvals, evidence, risk, and human
accountability.

Agents can perform work but cannot carry legal, organizational, or business
responsibility. Every managed Agent therefore has an accountable human or an
explicitly visible responsibility gap. ANC never invents visibility or control
that a Connector cannot actually provide.

## The three Agent classes

### Personal Agent

A Personal Agent is bound to one employee, such as that employee's coding or
desktop Agent. ANC manages the Agent as an enterprise asset: identity, provider
and runtime references, human and company binding, permissions, enterprise-data
eligibility, usage and cost, subscription or quota, credential-reference
status, renewal, lifecycle, and policy compliance.

The default management depth is `INVENTORY`. ANC does not ingest private task
content, complete conversations, local files, private sessions, or private
reasoning. A Connector must not imply that those data are available.

### Shared Agent

A Shared Agent serves a channel, group, team, or business function. It supports
two distinct Work modes:

- `OBSERVED`: ANC idempotently records initiator, Agent, external source
  reference, bounded summary, state, result reference, usage, and cost. The
  source system owns dispatch. Approval and full execution control are not
  implied.
- `GOVERNED`: ANC admits the work through a responsibility contract, freezes
  permission and data authority, can pause exact high-risk actions, records the
  human decision, evidence, result, cost, and complete responsibility chain.

Policy selects the mode based on risk, data, tools, and business context. ANC
does not require all shared work to become Governed Work.

### Federated Runtime

A Federated Runtime is an external company-level Agent platform that owns its
workspace, sessions, memory, sandbox, files, native task execution, and
collaboration UI. ANC does not proxy every execution or recreate that runtime.

The platform synchronizes neutral records for Agent directory entries, human
identity mappings, scopes/workspaces, Work/Runs, state, artifacts, cost,
approval events, evidence references, anomalies, and lifecycle. External IDs
and source links remain references. Vendor sessions, credentials, private
reasoning, and raw files do not become ANC domain records.

## Management depth and execution ownership

Every Agent declares both what ANC can manage and who executes work:

- `INVENTORY`: identity, ownership, permissions, usage, subscription, and
  lifecycle metadata only.
- `OBSERVED`: Inventory plus bounded external Work state and result references.
- `GOVERNED`: ANC can enforce admitted permissions, approval pauses, lifecycle
  control, and responsibility chains through a capable Connector.
- `FEDERATED`: an external platform executes; ANC synchronizes the declared
  management record through a stable contract.

Management depth is not a maturity score. It is a truthful capability boundary.
The execution owner is independently declared as `HUMAN_ENDPOINT`,
`ANC_CONNECTOR`, or `EXTERNAL_PLATFORM`. Invalid combinations fail closed.

## Unified portfolio records

ANC manages one cross-source Agent Portfolio containing:

1. Companies, departments, humans, membership, and external identity mappings.
2. Agents, providers, models, runtimes, external identities, source references,
   management depth, execution ownership, visibility, lifecycle, and owner.
3. Permissions, enterprise-data authorization, policy compliance, and opaque
   Secret or Token references with status and expiry metadata only.
4. Subscriptions, seats, quotas, renewal dates, renewal requests, usage, cost,
   budget, and anomaly records.
5. Goals, Projects, Work, Attempts, Runs, approvals, evidence, artifacts,
   results, anomalies, and responsibility records across all sources.
6. Connector capability and health declarations that separately describe data
   visibility and control authority.

## Work is a cross-source projection

ANC is not the only task system. The Work portfolio contains:

- Observed Work registered by a source Connector without ANC dispatch;
- Governed Work dispatched through ANC's existing responsibility and execution
  contracts; and
- Federated Work/Run projections synchronized from an external runtime.

Each Work record identifies its mode, initiator when known, executing Agent,
source system, external ID, channel/thread or workspace reference, sync state,
result/evidence references, usage/cost, and a safe return link. Private Personal
Agent activity is outside this projection by default.

## Connector truthfulness

Connector contracts declare capabilities instead of assuming a full runtime.
Declarations cover inventory, identity mapping, usage, subscription state,
credential status, observed Work, federated sync, artifacts, approvals,
evidence, dispatch, progress, pause/resume, cancellation, result, and lifecycle
control. Catalog registration and live health remain separate facts.

Provider and protocol names belong only in adapters and Connector packages.
`core`, `ports`, and `application` use neutral types. A missing capability
is a hard boundary, not a feature that the UI may simulate as live.

## Responsibility remains a primary product record

Governed Work must answer who initiated it, which human is accountable, which
Agent executed it, which permissions and data were used, who decided each
high-risk action, what evidence supports the work, what the result was, and what
it cost. The existing responsibility contract, Approval, Evidence, Result,
Event Store, Projection, and Outbox capabilities remain canonical.

Observed and Federated records must not be presented as having this complete
chain unless the source supplied and ANC admitted every required binding.

## Public exhibition Demo

The highest-priority first-run experience is `Explore a live demo company`.
It creates an isolated, temporary server-side Demo Session without registration,
OIDC, enterprise credentials, model keys, or production identity. Each session
receives a deterministic Northstar Analytics fixture and cannot read or mutate another
visitor's data.

The three-minute loop covers:

1. inspect Personal, Shared, and Federated Agents and their management depth;
2. inspect an externally sourced Observed Work item;
3. inspect a deterministic Federated workspace and synchronization state;
4. start Governed Work, reach a high-risk pause, and approve or reject it;
5. inspect evidence, cost, and responsibility chain;
6. submit a Token or subscription renewal request; and
7. reset the isolated Demo Session.

All Demo records are visibly labelled `DEMO_FIXTURE`. Demo never calls a paid
model, Slack-like service, federated platform, enterprise data source, shell,
filesystem, or production Secret broker. Failure recovery resets only that
session. The public Demo surface cannot access formal administration routes.
Formal mode continues to require OIDC and fails closed.

## Web product surface

The existing Paperclip-inspired layout, owned visual system, responsive shell,
and Chinese/English support remain. Information architecture changes
incrementally:

- Dashboard: Agent Portfolio totals, management depth, activity, cost, pending
  approvals, renewals, credential expiry, anomalies, and responsibility gaps.
- Agents: the unified asset directory and actual management boundary.
- Work: cross-source Observed, Governed, and Federated Work with return links.
- Approvals: only actions that truly require ANC governance.
- Governance: identity, Connectors, models, data, credential references,
  permissions, policy, management depth, and external sync.
- Usage & Billing: employee/Agent/department/provider views, subscription seats,
  quotas, renewals, budgets, and anomalous usage.

The office/3D experience remains an optional presentation surface. It cannot
define the domain model or block the Portfolio vertical slice.

## Deployment, release, and identity constitution

One codebase produces `managed-cloud` and `self-hosted` profiles. Managed
cloud may use a replaceable OIDC adapter; self-hosted may use enterprise
identity. Same account never means shared authority across products.

RC4, RC5, and RC6 images, release digests, Hong Kong/Hangzhou site directories,
prepare-only evidence, backup/restore, migration, upgrade, rollback, resource,
and isolation contracts are retained and immutable. The Agent Portfolio change
shipped in RC6, followed by corrective RC7 after target-host preflight found a
Node 22 installer invocation defect. Hong Kong now holds RC7 as a separate
fixture-only Demo candidate in `PREPARED_NOT_STARTED`; it has no startable
environment, Secret material, Company OS container, or public ingress. Formal
first start, Demo start/traffic, DNS/TLS cutover, real OIDC/Vault data, and
Hangzhou production cutover require their own authorization.

## Architecture constitution

The required dependency direction is:

`core <- ports <- application <- adapters/web`

`core` imports no Company OS layer or vendor SDK. `ports` imports domain
types from `core` only. `application` imports `core` and `ports` only.
Adapters, Web, and Connector SDK may depend inward. Raft Agent, Codex, DeepSeek,
Slack-like channels, federated platform names, NIP-07, Nostr event kinds, relay
concepts, database libraries, React, and browser APIs never enter inward layers.

## Current program boundary

Deliver the Agent Portfolio vertical slice and the isolated exhibition Demo.
Do not recreate external workspaces, sandboxes, memory, files, or native Agent
frontends; require all tasks to pass through ANC; collect Personal Agent private
activity; invent unavailable provider data; use production credentials or
data; overwrite immutable release evidence; or perform a broad backend rewrite.
