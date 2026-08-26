# Company OS product interaction specification

Status: implemented and browser-verified product slice, 2026-08-24.

## Interaction extraction

Prior Paperclip audit evidence was reused rather than repeated. The useful
product pattern is a short path from an empty company to visible work: orient
the operator, establish the company and people, add an Agent under a human, then
create work from a global action. Paperclip-specific routes, page composition,
copy, types and branding are not part of the contract.

Company OS changes that pattern around its own product premise:

1. The first screen creates or opens a company. The deterministic Demo is an
   explicit secondary path, never the default product state.
2. A human principal exists before an Agent and remains accountable for it.
3. Organization editing makes department, role, accountable human and autonomy
   explicit; a created Demo entry is never described as a live Agent.
4. New Task is a global action. Its goal, executor and allowed actions enter the
   Company OS responsibility pipeline together.
5. Formal organization mutation fails closed until an authenticated, tenant-
   bound command API exists.

## Information architecture

- Dashboard: active Agents, company metrics, recent tasks and activity.
- Inbox: responsibility- and risk-scoped items that need the current person's
  attention.
- Tasks: searchable task list; task detail separates properties, activity,
  admitted evidence/results and responsibility.
- Goals and Projects: company outcomes and cross-department workspaces without
  creating a second task authority.
- Organization & colleagues: Structure, Humans and Agents views; departments,
  human principals, Agent roles and colleague detail.
- Accountability: responsibility contract, approvals, evidence and result.
- Governance: Agent Connectors, model routes, data contracts, Secret boundary,
  tool permissions and egress audit.
- Settings: language, identity and access, deployment, security and approvals,
  audit and retention, data portability and profile.

## Implemented page map

| Product surface | Accepted interaction pattern | Company OS-owned semantics |
|---|---|---|
| Front door | explicit create/open choice before the application shell | company first; Demo is isolated and secondary |
| Setup | short progressive wizard with review-before-commit | company → department → accountable human → first unconnected Agent |
| Shell | compact company rail, grouped navigation, global create and search | Company OS routes, copy, icons, environment state and command boundary |
| Dashboard | active workers, metrics, recent work and chronological activity | accountable-human ownership and exact high-risk decision state |
| Tasks | dense searchable list, breadcrumb detail and tabbed dossier | work ID, responsibility contract, approval, evidence and result bindings |
| Inbox | needs-attention filters and direct decision routing | responsibility and risk determine who may act |
| Goals and Projects | concise operational lists | accountable outcomes and scoped workspaces without duplicate task ownership |
| Organization | structure plus Humans and Agents roster views | human principal precedes Agent; every Agent names one accountable human |
| Accountability | separate chain, approvals, evidence and activity views | approval is exact and immutable; evidence is admitted, not a generic attachment |
| Governance | tabbed administrative catalog | vendor-equal Connectors, model/data/secret/tool/egress boundaries and fail-closed settings |
| Settings | standalone category navigation | persistent English/Chinese interface language plus identity, deployment, security, audit, portability and profile boundaries |

The implementation uses Company OS-owned DOM, CSS, types, application client,
copy and tests. Internal class names and runtime guards deliberately contain no
upstream product identifier.

## Page interaction contracts

- First-run setup commits one validated organization draft after the review
  step; it does not leave partially-created company objects behind.
- Organization rows open Company OS-owned human/Agent detail dialogs. Agent
  details always expose accountable human, department, autonomy, runtime
  connection state and data boundary.
- New Task opens from the global rail and mobile create action. The task record
  separates detail, chronological activity, admitted evidence/results and the
  responsibility record.
- High-risk approval shows the exact approval/work/action/Agent/human/evidence
  binding before Approve or Reject is available.
- Administration tabs are functional views, not decorative filters. Demo empty
  states explicitly state that no model, credential, tool or data egress exists.
- Artifact presentation includes only admitted evidence and verified results;
  an ordinary attachment is not evidence by default.

## Extraction evidence

Every upstream interaction group has its rendered-page, route/source, API,
state and Company OS mapping recorded under `docs/paperclip-ui-extraction/`.
Paperclip remains reference-only. The Company OS implementation uses none of
its page code, brand, shared types or runtime services.

## State and API boundary

The Web consumes `CompanyOSApplicationClient`. Local setup currently creates an
explicitly labelled local draft in the deterministic in-memory client; it is
not represented as a deployed or connected company. Explicit Demo organization
changes are isolated in memory and reset with the fixture. Formal reads use
the stable Agent Boss projection. The current formal client deliberately returns
`FORMAL_ORGANIZATION_MUTATION_NOT_CONFIGURED` for organization writes; the UI
must not imply that a local Demo edit was persisted to production.

The next production slice should add one versioned, tenant-bound organization
command endpoint with optimistic revision checks. It must validate all external
input at the adapter and must not expose provider sessions, credentials or
vendor-specific identity types.

## Verification record

- Focused UI boundary, locale and projection tests pass.
- Playwright covers company-first creation, adding humans and Agents, Tasks
  list/detail/search, approval-to-evidence completion, all Governance tabs,
  command navigation and 320/768/1440 responsive widths.
- Browser screenshots for the rebuilt list, detail and organization views are
  stored under `outputs/ux-audit-2026-08-24/16-*` through `18-*`. The current
  product-grade capture set is under
  `docs/audits/2026-08-24-product-grade-current-run/`, including English and
  Chinese desktop states and the mobile shell.
- The Web uses the maintained Lucide icon package for its light line-icon
  system. It does not ship copied Paperclip icons or handcrafted SVG glyphs.
