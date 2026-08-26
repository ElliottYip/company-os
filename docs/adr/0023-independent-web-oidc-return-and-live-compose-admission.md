# ADR 0023: Independent Web OIDC return and live Compose admission

Status: Accepted
Date: 2026-08-25

## Context

Company OS deploys Web and API as separate services. Better Auth owns the OIDC
callback on the API, while the customer returns to the Web after the callback.
The first real Compose browser admission exposed two assumptions hidden by a
single-origin development environment:

- a relative post-login callback was resolved against the API origin; and
- the human-member and activity reads used browser-relative URLs and therefore
  reached the Web static server.

Both failures passed mocked browser tests but broke the independently deployed
topology.

## Decision

- The formal Web client receives its own exact origin separately from the API
  base URL and sends an absolute post-login return URL.
- Better Auth trusts only the API origin and exact Web origins admitted by
  `COMPANY_OS_WEB_ORIGINS`. Wildcards, credentials, paths, queries and fragments
  are rejected. Plain HTTP remains limited to loopback development origins.
- Every formal Web API request is tested to begin with the configured API
  origin; browser-relative API calls are not permitted.
- CI runs `npm run test:compose:self-hosted`. The admission creates temporary
  TLS material and credentials, starts digest-pinned Keycloak 26.7.2 plus the
  release-shaped PostgreSQL, migration, API and Web services, and drives a real
  Chromium session without route interception through OIDC authorization code
  + S256 PKCE, first-admin claim, company creation, organization creation,
  refresh persistence and readiness.
- The runner removes only its exact temporary containers, network, volume,
  images and files. It does not prune global Docker state or use production
  credentials/data.

## Alternatives considered

### Serve Web and API from one origin

Rejected because it would hide the deployment boundary required by both
managed-cloud and self-hosted Profiles.

### Accept an arbitrary callback URL from the browser

Rejected because it creates an open-redirect boundary. The browser proposes the
return URL, but the identity service admits it only when its exact origin was
configured by the operator.

### Keep only intercepted browser tests

Rejected because interception cannot prove cookie scope, OIDC redirects, TLS,
CORS, runtime Web configuration, container ordering or persistence across a
real deployment topology.

## Consequences

- Web and API can be independently hosted without losing the authenticated
  return path.
- A deployment must declare every customer Web origin explicitly.
- Release-shaped Compose is now an executable admission contract rather than a
  configuration-only artifact.
- The gate proves one private self-hosted bootstrap path. Production IdP
  acceptance, external TLS/proxy configuration and upgrade cutover remain
  separate operator evidence.
