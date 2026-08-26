# Paperclip authentication adoption record

Date: 2026-08-24
Paperclip commit: `213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`
License: MIT

## Code evidence reviewed

- `server/src/auth/better-auth.ts`
- `server/src/middleware/auth.ts`
- `server/src/routes/auth.ts`
- `packages/db/src/schema/auth.ts`
- `packages/db/src/client.ts`
- `server/src/__tests__/better-auth.test.ts`
- `server/src/__tests__/auth-routes.test.ts`
- `packages/db/src/schema/company_memberships.ts`
- `packages/db/src/schema/instance_user_roles.ts`
- `packages/db/src/schema/principal_permission_grants.ts`
- `server/src/routes/authz.ts`
- `server/src/services/company-member-roles.ts`
- `server/src/services/authorization.ts`
- `packages/shared/src/constants.ts` (`PERMISSION_KEYS`)
- `server/src/services/principal-access-compatibility.ts`
- `server/src/first-admin-claim.ts`
- `server/src/__tests__/authz-company-access.test.ts`
- `cli/src/checks/deployment-auth-check.ts`
- `server/src/routes/access.ts`
- `packages/db/src/schema/invites.ts`
- `packages/db/src/schema/join_requests.ts`
- `server/src/services/invite-grants.ts`
- `server/src/services/agent-invokability.ts`
- `packages/shared/src/agent-eligibility.ts`
- `packages/shared/src/agent-eligibility.test.ts`
- `packages/db/src/schema/agents.ts`
- `server/src/services/agents.ts`
- `server/src/__tests__/agents-pending-approval-config.test.ts`
- `ui/src/components/AgentConfigForm.tsx`
- `server/src/routes/agents.ts` (`approve`, `pause`, `resume`, `clear-error`,
  `terminate`, and pending-config PATCH handling)

## Adopted baseline

- Better Auth `1.6.25` is the sole human Web-session owner.
- Drizzle ORM `0.45.2` and postgres.js `3.4.9` own durable auth persistence.
- Cookies are instance-scoped; authenticated deployments enable rate limiting;
  trusted origins and secure-cookie behavior derive from explicit deployment
  configuration; request identity is resolved from the server session.
- Auth tables and migrations are Company OS-owned and use
  `company_os_auth_*` names. Company OS does not depend on Paperclip packages,
  services, database schema, or runtime types.
- Company access uses Paperclip's mature membership vocabulary and invariants:
  `pending | active | suspended | archived`, human roles
  `owner | admin | operator | viewer`, Agent role `member`, active-membership
  tenant scope, viewer read-only enforcement, and responsible-human access
  intersection for Agent actions. Instance administration does not imply
  blanket access to every company.
- Cross-company resource lookup must collapse inaccessible and missing records
  to the same stable not-found result before write authorization, preventing a
  resource-existence oracle.
- Authorization follows Paperclip's actual layered behavior rather than a
  locally invented role matrix: instance admin elevation is evaluated first,
  active same-company membership supplies only documented visibility/simple
  mode carve-outs, and privileged operations otherwise require an explicit
  principal permission grant. `owner` is not treated as an implicit wildcard;
  its default grant set remains the eight keys returned by Paperclip's
  `grantsForHumanRole("owner")`.
- Company OS adopts the complete stable permission-key vocabulary at this pin
  so Connector/tool/audit permissions can be represented without later schema
  invention. It does not import Paperclip constants or database/runtime types.
- Human invitation behavior follows Paperclip's single-use capability pattern:
  only a token hash is persisted, acceptance checks expiry/revocation/email and
  tenant scope, and membership/grants are committed atomically. The raw token
  is returned only at creation time.
- Generic Agent admission follows Paperclip's tested lifecycle: pending records
  are non-invokable and configuration-frozen; approval applies the reviewed
  snapshot atomically; paused, terminated, invalid-reporting-chain, and unknown
  states remain non-invokable.
- Work eligibility preserves Paperclip's assignment/invocation distinction:
  paused Agents may retain assignments but cannot be invoked; pending and
  terminated Agents cannot be assigned or invoked; a terminated Agent manager
  invalidates Agent descendants, while a paused Agent manager creates an
  escalation-path warning rather than blocking unrelated work.
- Pending Agent profile, runtime, permission, and Connector configuration is
  immutable through the ordinary organization/configuration command. The
  reviewed snapshot remains authoritative until approval moves the Agent to
  `idle`; subsequent configuration changes use the ordinary authorized path.

## Company OS extension

Paperclip has no enterprise OIDC login implementation at this commit. Company
OS uses Better Auth's official Generic OAuth plugin for enterprise OIDC, with
PKCE and issuer validation explicitly enabled. Formal first-run access remains
blocked until the provider is configured and a session is verified.

Company OS additionally keeps Agent responsibility contracts and enterprise
data authorization independent from membership grants. New formal Agent
records receive a non-executable responsibility draft until Connector,
permission, data and accountable-human bindings are activated.

The Company OS Web therefore presents two explicit, non-substitutable gates:
Paperclip-aligned Agent admission and Company OS responsibility-contract
activation. A lifecycle `idle` Agent with a draft responsibility contract, or
an active responsibility contract attached to a pending Agent, remains
ineligible for formal task assignment.

These are named Company OS extensions. They do not introduce a competing
membership, invitation, Agent admission, or generic approval state machine.

## Rejected local alternative

The temporary custom PKCE transaction and in-memory session implementation was
removed after the Better Auth contract tests were established. It is not a
production owner and does not coexist with Better Auth.

## Security differences

- Email/password and implicit local-board login are disabled.
- OAuth tokens are encrypted at rest through Better Auth's account option.
- Company membership, accountable-human responsibility, and Company OS roles
  remain separate application concerns after authentication.
