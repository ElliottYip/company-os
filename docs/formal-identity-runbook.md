# Formal enterprise identity runbook

Company OS formal mode uses the same authentication architecture proven in the
audited Paperclip server: Better Auth, durable Postgres sessions, scoped
cookies, trusted origins, database-backed rate limiting, and request-scoped
session resolution. Company OS replaces Paperclip email/password with Better
Auth Generic OAuth for mandatory enterprise identity. Deployments may use a
standard OIDC provider or a tenant-owned Feishu OAuth application.

Enterprise identity is mandatory for formal identity and formal capabilities,
not for opening the product. Before a provider is configured, a user may create an
isolated, session-scoped local company draft and browse the product. That draft
cannot open an existing company, access enterprise data or Secrets, execute a
real Agent, publish a production approval, or act as a verified principal. See
ADR 0018.

## Required server configuration

### Standard OIDC

```text
COMPANY_OS_PUBLIC_URL=https://company.example.com
COMPANY_OS_IDENTITY_PROVIDER=OIDC
COMPANY_OS_OIDC_ISSUER=https://identity.example.com
COMPANY_OS_OIDC_DISCOVERY_URL=https://identity.example.com/.well-known/openid-configuration
COMPANY_OS_OIDC_CLIENT_ID=company-os
COMPANY_OS_OIDC_CLIENT_SECRET=<secret reference injected at runtime>
COMPANY_OS_OIDC_REDIRECT_URI=https://company.example.com/api/auth/oauth2/callback/enterprise-oidc
COMPANY_OS_SESSION_SIGNING_KEY=<at least 32 bytes, injected at runtime>
COMPANY_OS_DATABASE_URL=postgres://...
COMPANY_OS_INSTANCE_ID=production
# Only when the origin is reachable exclusively through these proxies:
COMPANY_OS_TRUSTED_PROXY_CIDRS=192.0.2.10/32,2001:db8:1234::/48
```

Register the redirect URI exactly as shown. Do not place the client secret,
session signing key, or database password in the Web build, repository, logs,
events, exports, or Company OS domain records.

Company OS derives the direct peer address itself and ignores client-supplied
`X-Forwarded-For` unless `COMPANY_OS_TRUSTED_PROXY_CIDRS` is configured. When
configured, the direct peer is appended to the forwarded chain and Better Auth
walks it right-to-left through the declared proxy CIDRs. Use actual ingress
addresses/subnets, never a broad private range that also contains clients. The
origin must not remain directly reachable around that ingress.

Better Auth is configured to generate lowercase UUIDs for all Company OS-owned
auth records. This keeps authenticated user IDs compatible with the product's
stable portable-ID, membership, audit, and URL contracts; external OIDC `sub`
values remain external identity bindings and never become Company OS domain IDs.

The `/oauth2` segment is owned by Better Auth Generic OAuth and is part of the
deployment contract. Releases before ADR 0021 documented a shorter callback;
that value is incompatible with strict providers and must be replaced in both
the IdP client and service environment during upgrade.

### Feishu OAuth

Use a separate enterprise self-built app named `Company OS`; do not add these
permissions to an unrelated bot or automation app.

```text
COMPANY_OS_PUBLIC_URL=https://company.example.com
COMPANY_OS_IDENTITY_PROVIDER=FEISHU
COMPANY_OS_FEISHU_APP_ID=<app id>
COMPANY_OS_FEISHU_APP_SECRET=<secret reference injected at runtime>
COMPANY_OS_FEISHU_TENANT_KEY=<the one permitted company tenant key>
COMPANY_OS_FEISHU_REDIRECT_URI=https://company.example.com/api/auth/oauth2/callback/feishu
COMPANY_OS_SESSION_SIGNING_KEY=<at least 32 bytes, injected at runtime>
COMPANY_OS_DATABASE_URL=postgres://...
COMPANY_OS_INSTANCE_ID=production
```

Register the callback exactly. Company OS uses authorization code flow with
S256 PKCE, validates OAuth state through durable database storage, accepts only
the fixed official Feishu hosts, and rejects a profile whose `tenant_key` does
not equal `COMPANY_OS_FEISHU_TENANT_KEY`. The stable Feishu `union_id`, not an
email address, is the authentication subject. Feishu states that phone and
email values are administrator-imported rather than verified in real time.
Company OS prefers `enterprise_email`, then `email`; when both are absent it
derives a stable non-deliverable `@identity.invalid` local alias from the
already verified tenant and subject so login does not fail merely because the
tenant has no mail attributes. The alias must never be used for email delivery.

Login needs only these user scopes:

- `auth:user.id:read`
- `contact:user.email:readonly`

Do not grant message, document, calendar, approval, attendance, or write
permissions. OAuth login alone does not expose the company organization tree.

### Optional read-only Feishu directory import

Organization import is a separate server-to-server boundary using a short-lived
`tenant_access_token`. The adapter reads the recursive department list and the
direct members of each department, then emits the vendor-neutral
`EnterpriseDirectorySourcePort` snapshot. It never returns the Feishu token,
phone number, employee number, or unrelated profile fields.

After the secret file and non-secret coordinates are installed, operators can
verify the live read-only boundary without printing employee records or secret
material:

```sh
COMPANY_OS_FEISHU_APP_ID=<app-id> \
COMPANY_OS_FEISHU_APP_SECRET_FILE=/run/company-os/secrets/feishu-app-secret \
COMPANY_OS_FEISHU_TENANT_KEY=<tenant-key> \
npm run ops:verify:feishu-directory
```

The command returns only aggregate counts and a deterministic structural digest.
It rejects duplicate identities, orphan departments, orphan human memberships,
malformed responses, unbounded pagination, and a mismatched tenant.

In Feishu Developer Console, request only the current read-only permissions
shown for these two official APIs:

- `GET /open-apis/contact/v3/departments/0/children`: basic directory and
  department organization information.
- `GET /open-apis/contact/v3/users/find_by_department`: user basic information,
  user organization information, and user email information only if invitation
  matching needs it.

The app's **通讯录权限范围** controls which records are returned. Reading from
root department `0` requires the administrator to set that range to **全部成员**.
For least privilege, select only the departments Company OS actually manages
unless a complete company mirror is required. No directory permission is
needed merely to enable Feishu login.

## First start

1. Create an empty Company OS-owned PostgreSQL database.
2. Inject the variables above through the deployment secret mechanism.
3. Run `npm run db:migrate` with migration credentials.
4. Start `npm run start:self-hosted` with runtime credentials.
5. Open the Web. `Create a company` must offer the labelled local-draft setup;
   `Open an existing company` must lead to formal identity diagnostics.
6. Open `/api/v1/access`. It must report `AUTHENTICATION_REQUIRED`, not
   `READY`, before a verified session exists.
7. Start sign-in through `/api/auth/sign-in/social`; Better Auth owns state,
   PKCE, callback validation, encrypted OAuth account tokens, and the session
   cookie.

The Web configuration checklist is diagnostic only. Set issuer, client,
database, and signing configuration in the service environment or deployment
Secret manager; never paste those values into the browser. After updating the
service configuration, restart the service and use `Configure formal access`
from the local workspace to re-check readiness.

External databases are never migrated silently at service start. If session
storage is unavailable, formal access returns
`FORMAL_IDENTITY_RUNTIME_UNAVAILABLE` and remains fail-closed.

## Provider compatibility admission

Before a customer staging login, run the read-only verified-TLS boundary check
documented in `docs/customer-boundary-acceptance.md`. It validates Discovery
and S256 without creating a user or session; the browser login remains a
separate customer-approved acceptance step.

The fast reference IdP test verifies two identities, invitation acceptance and
negative permission cases. The independent second-provider gate is:

```sh
npm run test:oidc:keycloak
```

It runs pinned Keycloak 26.7.2, PostgreSQL 16, the production build and
Chromium on loopback with runtime-generated credentials. It performs a real
authorization-code + S256 PKCE login through the Keycloak page, then creates a
company and accountable owner organization through Company OS. No route is
intercepted. The runner removes its containers and temporary Realm on success
or failure. `start-dev` and disabled certificate verification are confined to
this self-signed compatibility environment; neither is a production setting.

## Sources

- Paperclip pinned source and adoption mapping:
  `docs/audits/paperclip-auth-adoption.md`
- Better Auth Generic OAuth:
  https://better-auth.com/docs/plugins/generic-oauth
- Better Auth rate limiting:
  https://better-auth.com/docs/concepts/rate-limit
- Keycloak OIDC endpoints and discovery:
  https://www.keycloak.org/securing-apps/oidc-layers
- Keycloak container and startup Realm import:
  https://www.keycloak.org/server/containers
- Keycloak TLS configuration:
  https://www.keycloak.org/server/enabletls
- Keycloak production configuration:
  https://www.keycloak.org/server/configuration-production
