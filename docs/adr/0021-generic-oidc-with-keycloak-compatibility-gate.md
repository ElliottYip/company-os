# ADR 0021: Generic OIDC with a Keycloak compatibility gate

Status: Accepted
Date: 2026-08-25

## Context

The reference OIDC server proved standards behavior but accepted any callback
URI it was given. A real Keycloak 26.7.2 admission rejected Company OS because
the documented URI omitted Better Auth Generic OAuth's `/oauth2` route segment.
The old test therefore proved PKCE and claim handling, but did not prove that a
strict enterprise IdP could be configured successfully.

Company OS must keep identity replaceable. Adding a Keycloak SDK or Keycloak
claims to core/application would fix one deployment while weakening the
product boundary.

## Decision

- Better Auth Generic OAuth remains the only formal Web-session owner and
  `IdentityPort` remains the inward boundary.
- The canonical redirect URI is exactly
  `/api/auth/oauth2/callback/enterprise-oidc`. The former
  `/api/auth/callback/enterprise-oidc` value is rejected with
  `OIDC_REDIRECT_URI_MISMATCH`; there is no ambiguous dual callback.
- The reference IdP test remains the fast protocol and two-user permission
  test.
- Keycloak is the declared second implementation compatibility gate. The gate
  runs Keycloak 26.7.2 from the immutable image digest
  `sha256:831330513f55695572286e521f94fcd3c7e285250ed5b848090265a33192f669`,
  PostgreSQL 16 from its pinned image digest, the production Company OS Web and
  API, and Chromium without route interception.
- Realm, administrator, client and user credentials are generated at runtime,
  stored only in a private temporary directory/environment, and destroyed with
  the containers. No credential is committed or logged.
- The compatibility test verifies Discovery, strict redirect matching,
  authorization code + S256 PKCE, token/JWKS validation, durable session,
  first-admin claim, company creation and accountable-owner organization setup.

The Keycloak container uses `start-dev` only inside the isolated test runner.
It is not a deployment recommendation; production Keycloak must use its secure
production profile, explicit hostname/TLS and separate administration exposure.

## Alternatives considered

### Keep only the permissive reference IdP

Rejected because it already missed a callback-path defect that a conforming
real provider correctly rejected.

### Add a Keycloak adapter or vendor claims to Company OS

Rejected because Keycloak exposes standard discovery and OIDC endpoints.
Vendor-specific runtime code would create unnecessary identity lock-in.

### Accept both callback paths

Rejected because two registered redirects enlarge the authentication surface
and hide deployment drift. One library-owned route is easier to audit.

## Consequences

- Existing deployments configured with the former callback must update both
  the IdP client and `COMPANY_OS_OIDC_REDIRECT_URI` before upgrading.
- `npm run test:oidc:keycloak` is the reproducible second-provider admission.
- The CI gate detects callback, discovery, PKCE, claim and login-page regressions
  against a real provider release rather than a local response fixture.
- Keycloak upgrades are explicit compatibility changes: update the pinned
  version/digest, read the official upgrading guide, and rerun this gate.
