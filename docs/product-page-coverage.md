# Company OS product page coverage

Status: active delivery contract, 2026-08-25.

This inventory is the completion gate for the product-grade Web goal. It uses
the pinned Paperclip checkout at
`work/upstream-audit/paperclip` (`213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`,
MIT) as an interaction reference, not as a runtime or source dependency.
Company OS does not copy Paperclip branding, page source, private types, or
English strings. A Paperclip route is not automatically a Company OS product
requirement: every route family below has an explicit product decision.

Decision vocabulary:

- **IMPLEMENT**: a first-class Company OS page or flow.
- **MERGE**: the capability is present in a Company OS-owned page with a
  different information architecture.
- **DEFER**: valid roadmap capability, deliberately outside this delivery.
- **EXCLUDE**: conflicts with the product charter or belongs to an upstream
  development/operations surface.

## Product navigation contract

| Company OS group | Surface | Decision | Delivery state | Canonical Company OS owner |
|---|---|---:|---:|---|
| Work | Dashboard | IMPLEMENT | Implemented | Work, approval, evidence and organization projections |
| Work | Inbox / Needs attention | IMPLEMENT | Implemented | Approval and responsibility projections |
| Work | Tasks and task detail | IMPLEMENT | Implemented | Work application service |
| Work | Goals | IMPLEMENT | Implemented | Company structure and work scopes |
| Work | Projects and workspaces | IMPLEMENT | Implemented | Company structure registry |
| Company | Organization | IMPLEMENT | Implemented | Organization application service |
| Company | Humans | IMPLEMENT | Implemented | Organization principals and identity bindings |
| Company | Agents | IMPLEMENT | Implemented | Organization principals, responsibility contracts and Connector bindings |
| Control | Approvals | IMPLEMENT | Implemented | Approval port and responsibility projection |
| Control | Evidence and results | IMPLEMENT | Implemented | Audit/evidence port and responsibility projection |
| Control | Activity / timeline | IMPLEMENT | Implemented | Company event store projection |
| Control | Accountability | IMPLEMENT | Implemented | Responsibility contracts and records |
| Admin | Governance | IMPLEMENT | Implemented | Model, data, secret, tool and egress policies |
| Admin | Connectors | MERGE | Implemented | Connector registry and SDK |
| Admin | Usage and budgets | IMPLEMENT | Implemented | Provider-neutral usage and policy projection; no invented billing data |
| Admin | Settings | IMPLEMENT | Implemented | Identity, deployment, security, audit, locale and profile boundaries |
| Utility | Search / command palette | IMPLEMENT | Implemented | Client-side navigation and server-backed search boundary |

Organization profile forms update only human/Agent presentation and department
placement. Opaque IDs remain stable, while Agent responsibility, autonomy and
runtime binding use separate reviewed commands. Human access suspension and
Agent termination retain the historical principal so responsibility evidence
cannot disappear through an ordinary edit.

## Paperclip route-family disposition

| Paperclip route family | Verified source area | Company OS decision | Company OS destination / rationale |
|---|---|---:|---|
| Dashboard and live view | `ui/src/App.tsx`, dashboard pages | IMPLEMENT | Dashboard. Live state is expressed through structured event and execution projections. |
| Timeline | activity/timeline pages | IMPLEMENT | Activity. Must preserve original event/evidence text and expose stable event codes. |
| Onboarding | onboarding pages | IMPLEMENT | Company-first creation, then department, accountable human and optional Agent binding. Demo remains a clearly secondary fixture entry. |
| Companies | company selector and settings pages | IMPLEMENT | Company switcher plus create/open/recovery states. Multi-company authorization remains server-enforced. |
| Company general settings | company settings pages | IMPLEMENT | Settings / General. |
| Export, import and company closure | company export/import pages | IMPLEMENT | Settings / Data portability. Formal export/import are service-owned; irreversible closure requires a fresh backup digest, exact confirmation and server-side lifecycle guards. |
| Members and invites | company member/invite pages | MERGE | Settings / Identity & access and Humans. Company OS distinguishes identity from organizational responsibility. |
| Secrets | company secrets page | MERGE | Governance / Secrets. The control plane displays metadata only; secret values never return to the browser. |
| Instance profile/general | instance settings pages | MERGE | Settings / Profile and Deployment. One codebase supports managed-cloud and self-hosted profiles. |
| Environments | instance environment pages | MERGE | Settings / Deployment. Company OS uses deployment profiles and local execution nodes rather than Paperclip environment types. |
| Access | instance access pages | MERGE | Settings / Identity & access. IdentityPort remains replaceable and tenant/audience checks fail closed. |
| Heartbeats | instance heartbeat settings | MERGE | Connectors / Health. Heartbeat is Connector health, not an independent customer page. |
| Plugins and adapters | instance plugin/adapter pages | MERGE | Connectors. Only Company OS Connector SDK contracts appear in the customer product. |
| Apps browse/connections/gateways/runtime/policies | apps pages | MERGE | Connectors and Governance. Vendor-private sessions, credentials and internal runtime types are excluded. |
| Skills and studio | skills/studio pages | DEFER | Future Connector capability authoring; not required for the Agent Boss control-plane delivery. |
| Organization | org page | IMPLEMENT | Organization plus dedicated Humans and Agents projections. |
| Agents list/create/detail/runs | agent pages | IMPLEMENT | Agents. Requires accountable human, responsibility contract, capabilities and Connector state. |
| Projects/issues/workspaces/config/budget | project and issue pages | IMPLEMENT | Projects, Tasks and Usage & budgets; terminology is Company OS-owned. |
| Routines | routines pages | DEFER | Recurring work requires an explicit neutral scheduling domain and lifecycle before a UI is admitted. |
| Experimental cases/status/review queue/learnings/pipelines | experimental pages | EXCLUDE | Paperclip-specific experimental product model; it is neither copied nor made a Company OS canonical owner. |
| Execution workspaces | execution workspace pages | MERGE | Connector run detail and evidence. Private execution sessions are never projected into the control plane. |
| Goals | goals pages | IMPLEMENT | Goals. Goals keep an accountable human and scope to company/department/project/workspace. |
| Artifacts | artifact pages | IMPLEMENT | Evidence and results. Attachments are not automatically admitted evidence. |
| Approvals | approval pages | IMPLEMENT | Approvals. Each decision binds the exact action/digest/work/contract/Agent/human/evidence/result context. |
| Costs | cost pages | IMPLEMENT | Usage & budgets. Provider-neutral aggregation with an explicit unavailable state when data is absent. |
| Activity/audit | activity pages | IMPLEMENT | Activity plus Settings / Audit & retention. |
| Board chat | board chat page | EXCLUDE | Chat is not the Company OS control plane and must not become a second task authority. |
| Decisions and queues | decision/queue pages | MERGE | Inbox and Approvals. Responsibility and risk determine who may decide. |
| Training | training pages | DEFER | Product charter phase 4; intentionally outside the current delivery. |
| Inbox and join requests | inbox pages | IMPLEMENT | Inbox. Join requests are identity/access items, while high-risk work decisions remain distinct approvals. |
| User profile | profile page | IMPLEMENT | Settings / Profile. |
| Auth/claim/invite | auth pages | IMPLEMENT | Identity adapter entry, invite acceptance and blocked/recovery states; no NIP-07 or Raft dependency in the product core. |
| Plugin-provided pages | plugin route host | EXCLUDE | Customer IA is Company OS-owned. Connectors may contribute capabilities and structured projections, not arbitrary branded pages. |
| Design guide/dev labs | developer pages | EXCLUDE | Internal upstream development surfaces; component examples live outside the customer navigation. |
| Not found | error route | IMPLEMENT | Accessible not-found and safe return path. |

## Required state matrix

Every IMPLEMENT or MERGE destination must account for these states. A state may
be intentionally impossible only when the page contract documents why.

| State | Required behavior |
|---|---|
| Loading | Stable page skeleton or status; no misleading zero values. |
| Empty | Explain what is absent, why it matters, and the valid next action. |
| Error | Structured error code, retry path and no dependence on translated server strings. |
| Blocked | Explain the missing identity, permission, responsibility, Connector or deployment binding. |
| Success | Show provenance and the authoritative projection, not an optimistic fiction. |
| Demo fixture | Clearly label simulated data and never imply a real Agent/model/tool call. |
| Formal | Revalidate identity, tenant, responsibility, policy and exact-action bindings server-side. |
| Mobile | Preserve task, approval and evidence actions without horizontal page overflow. |
| Keyboard | Logical focus order, visible focus, native controls and operable dialogs/tabs. |

## Completion evidence

An inventory row is complete only when it has:

1. a Company OS implementation or an explicit exclusion/defer rationale above;
2. focused tests for its contract and critical state transitions;
3. desktop and mobile current-run screenshots for implemented surfaces;
4. same-state comparison notes where Paperclip supplied the interaction
   reference; and
5. full `npm run verify` evidence.

The admission also runs `npm run check:web-interactions`. Every rendered
customer-surface button must either submit a handler-bound form, be explicitly
disabled, or expose a hook that is actually selected by the interaction layer;
every non-dialog form must be handler-bound. Placeholder links, JavaScript URLs
and inline event handlers fail the build. This prevents visually complete but
non-functional controls from entering an accepted page.

Current-run visual evidence is stored under
`docs/audits/2026-08-24-product-grade-current-run/`. The capture set includes
all 15 accepted application sections at both `1440 × 900` and `390 × 844`, plus
the front door and focused workflow captures. Chinese Dashboard, Organization
and Settings captures verify the locale and spacing boundary.
`capture-report.json` records 42 captures with viewport, active language and
horizontal-overflow results; every capture reports no horizontal overflow.

The latest full admission on 2026-08-26 has 527 unit and integration cases
(523 passed and four explicit external-infrastructure skips),
boundary and independence guards, secret and dependency audits, strict type
checking, the production build, the Web performance budget, and 19 browser
E2E cases (15 passed and four explicit external-infrastructure skips). A disposable PostgreSQL 16 instance enabled the real database,
reference Connector and HTTPS OIDC/PKCE cases; the live browser case used no
route interception and completed runtime registration, Agent admission, action
policy configuration, responsibility activation, task dispatch, exact approval,
PAUSE/RESUME, evidence/result and Activity history across API restarts. It then
downloads the governed accountability package, verifies its exact responsibility
references and SHA-256 digest, restarts the API, and replays the captured
idempotency command to the same package. It then
creates a second concurrent Work and proves request-cancellation → CANCEL →
Connector-confirmed `CANCELLED` without confusing acceptance with completion.
It also lets a third running Work cross its Connector-declared deadline, proves
automatic `OUTCOME_UNKNOWN`, records an evidence-bound `SAFE_TO_RETRY` decision,
and submits one new-authority Attempt without replaying the original.
Finally, the formal Web creates an active data authorization, binds it to a new
Work, injects a customer Data Node interruption before Agent submission, and
requires the original initiator to resume preparation. The node returns only
references and a digest; the recovered Work reaches the Agent Connector exactly
once.
Formal multi-Work creation is independent from Demo's intentionally serial
three-minute loop. The
loopback protocol peer was an explicitly synthetic fixture, not a real Agent.
The formal Activity page
uses a tenant-authorized, paginated and raw-payload-free server projection; the
Dashboard, Inbox, Approvals and Accountability surfaces resolve the real Work
title and accountable human rather than Demo copy. The initial application
bundle is 267,309 bytes raw / 70,880 bytes gzip; the
graph renderer is loaded only on pages that use it. Governance includes formal
Tool Access profiles/bindings/policies, and Usage & Budgets now reads verified
cost events and writes revisioned budget policies instead of showing an
unconnected placeholder. Inbox pending/assigned/resolved tabs and Tasks
list/board/filter/sort controls now consume authoritative Work/Attempt data,
persist presentation preferences, and have focused unit/browser coverage.
Formal access, company/member directories, organization, planning,
Work/Attempt, accountability and administration responses are admitted through
deep trust-boundary validation. Cross-tenant identifiers, malformed approval
bindings, Demo evidence in formal ledgers and credential/private-session fields
fail closed before customer-facing state is rendered.
All formal JSON responses, including the enterprise OIDC start response, must
also pass media-type, declared and actual 4 MiB size, non-empty and UTF-8 JSON
admission before either stable API errors or product projections are consumed.
The same boundary applies a complete-response deadline, converts browser-private
network failures into stable offline state, and deliberately avoids implicit
retries for mutations whose external outcome may be unknown.
A browser recovery gate also proves that an initial network failure renders an
explicit offline state and that one user-triggered retry reloads authoritative
formal access instead of falling back to Demo or stale optimistic state.
A release-shaped no-interception admission additionally terminates the real API
process behind the HTTPS Web Edge, observes stable offline state, restarts the
service on the same isolated PostgreSQL database, and proves that the signed
session, selected second company and organization recover after one user retry.
