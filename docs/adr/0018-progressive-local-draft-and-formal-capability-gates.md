# ADR 0018: Progressive local draft with formal capability gates

Status: Accepted
Date: 2026-08-25
Supersedes: ADR 0016

## Context

ADR 0016 correctly made enterprise OIDC mandatory for formal identity and
formal company operations, but coupled that server security rule to a global
Web gate. A first-time user who had not yet coordinated OIDC could see only
diagnostics. They could not shape a company, understand the product, or prepare
an organization before involving an identity administrator.

The pinned Paperclip interaction audit shows a useful product principle: the
application can remain navigable while unavailable capabilities expose clear
failure states and recovery actions. Company OS applies that principle through
its own Web, domain language, and responsibility model. Paperclip code, UI, and
runtime types are not dependencies.

## Decision

- The default `Create a company` path opens a Company OS-owned local draft.
  Users can define the company, first department, accountable human, unbound
  Agent, goals, and projects without enterprise OIDC.
- A local draft is isolated, session-scoped, and visibly labelled. It is not a
  formal company, verified identity, production record, or durable backup.
- Deterministic task and approval activity in a local draft is labelled as a
  simulation. It never calls a model, tool, Connector, Relay, filesystem,
  shell, Secret broker, or enterprise system.
- `Open an existing company` continues to require verified formal identity.
  When OIDC is configured but no session exists, the formal entry starts SSO
  directly and preserves the return path instead of making the user interpret
  deployment diagnostics. Diagnostics appear only when configuration is
  incomplete or the identity runtime fails.
- After authentication, the server returns only companies visible to the
  principal. Selection resolves in this order: a valid active selection, the
  last authorized company stored in the browser, then the first authorized
  company. Stale stored IDs are ignored.
- The Company OS sidebar owns a keyboard-accessible company switcher. A switch
  updates the selected opaque company ID, clears company-scoped transient UI
  state, stores the new selection, and reloads projections through the same
  tenant-bound formal APIs. It never reuses the previous company's projection.
- Real Agent execution, enterprise data access or export, Secret use,
  production approvals, durable audit publication, imports, and exports remain
  server-authorized formal capabilities. Missing OIDC keeps them fail-closed.
- The Web displays unavailable capabilities in context and provides a narrow
  `Configure formal access` recovery path. Returning from diagnostics restores
  the local draft without treating it as authenticated.
- OIDC client secrets, session signing keys, and database credentials remain
  server-side. The browser displays configuration names and stable status codes
  but never accepts Secret material.
- Promotion from local draft to formal company is a future explicit command.
  It may copy only a validated, sanitized organization/planning template and
  must rebind identity, membership, Agent, Connector, permissions, data grants,
  responsibility contracts, and approval authority.

## Capability boundaries

| Capability | Local draft | Formal company |
| --- | --- | --- |
| Company and organization design | Available, session-scoped | Durable and authorized |
| Goals and projects | Available, session-scoped | Durable and authorized |
| Task/approval walkthrough | Deterministic simulation only | Connector-backed execution |
| Existing company data | Unavailable | Verified membership required |
| Enterprise data and Secrets | Unavailable | Policy and authorization required |
| Production approval/publication | Unavailable | Exact-action approval required |
| Import/export and durable audit | Unavailable | Server-owned formal capability |

## Alternatives considered

### Keep the global OIDC gate

Rejected because it makes identity administration a prerequisite for learning
or preparing the product, while adding no protection beyond the existing
server-side capability checks.

### Add an implicit local administrator

Rejected because a fixture or device identity cannot safely become a legal or
organizational principal. Local edits remain drafts and never grant formal
authority.

### Let local mode call real Agents with user-supplied browser credentials

Rejected because it would create a second Secret and execution boundary,
weaken audit semantics, and blur simulation with production.

## Consequences

- First run is useful before OIDC coordination, but every local surface must
  preserve an honest environment label.
- Server authorization and `FormalAccessStatus` remain unchanged and
  fail-closed; this ADR changes Web orchestration, not identity responsibility.
- Local data currently lasts only for the active browser session. Durable local
  drafts require a separate storage adapter and migration contract before the
  product may claim persistence.
- Tests must cover both directions: local creation succeeds without OIDC, and
  formal capabilities remain unavailable until a verified session exists.

## Evidence

- `docs/audits/paperclip-auth-adoption.md`
- `web/mount.ts`
- `web/application-client.ts`
- `application/get-formal-access-status.ts`
- `tests/e2e/company-os.spec.ts`
