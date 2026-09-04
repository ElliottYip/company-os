# ADR 0049: Separate Feishu OAuth login from directory import

## Status

Accepted

## Date

2026-09-01

## Context

The company uses Feishu but does not operate a general-purpose OIDC provider.
Feishu offers OAuth login and Contact v3 APIs, but OAuth login does not itself
provide the organization hierarchy. Combining both capabilities under one
broad permission grant would give a login integration unnecessary access to
company data and would couple Feishu concepts into the Company OS domain.

## Decision

Support `FEISHU` as a formal identity-provider profile through Better Auth's
Generic OAuth adapter. Authenticate with authorization code, state, and S256
PKCE; tenant-lock the callback; and bind the local account to stable `union_id`.

Expose organization data through a separate, vendor-neutral
`EnterpriseDirectorySourcePort`. The Feishu adapter uses application identity
and current Contact v3 read APIs. Permissions and data ranges are configured
independently in Feishu. External responses are bounded and validated at the
adapter boundary; tokens and unrelated sensitive fields never enter the port.

## Alternatives considered

### Build an internal OIDC provider

Rejected for this deployment because it adds credential lifecycle, MFA,
recovery, security monitoring, and availability responsibilities while the
company already has a managed employee identity source in Feishu.

### Treat Feishu OAuth as OIDC

Rejected because the integration lacks the OIDC issuer, discovery document,
and ID-token validation contract used by the existing OIDC adapter.

### Grant full Contact permissions during login

Rejected because interactive login and organization synchronization have
different trust, consent, and operational boundaries.

## Consequences

- Formal deployments select exactly one provider with
  `COMPANY_OS_IDENTITY_PROVIDER`.
- Existing OIDC deployments remain the default and are unchanged.
- Feishu login can ship without directory access.
- Complete organization import still needs administrator approval and an app
  data scope of all members; narrower department scopes produce a partial but
  explicit snapshot.
- Feishu enterprise email is used only as an administrator-asserted invitation
  attribute after subject and tenant verification, never as the login secret.
