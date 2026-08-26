# Formal enterprise identity runbook

Company OS formal mode uses the same authentication architecture proven in the
audited Paperclip server: Better Auth, durable Postgres sessions, scoped
cookies, trusted origins, database-backed rate limiting, and request-scoped
session resolution. Company OS replaces Paperclip email/password with Better
Auth Generic OAuth for mandatory enterprise OIDC.

Enterprise OIDC is mandatory for formal identity and formal capabilities, not
for opening the product. Before OIDC is configured, a user may create an
isolated, session-scoped local company draft and browse the product. That draft
cannot open an existing company, access enterprise data or Secrets, execute a
real Agent, publish a production approval, or act as a verified principal. See
ADR 0018.

## Required server configuration

```text
COMPANY_OS_PUBLIC_URL=https://company.example.com
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
