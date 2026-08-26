# ADR 0025: Managed-cloud verified administrator provisioning

Status: Accepted
Date: 2026-08-25

## Context

Private self-hosted installations can safely expose a one-time first-admin
claim on their private network. A public managed-cloud API cannot: allowing the
first authenticated internet user to claim the global instance would create an
account-takeover race. The Web previously displayed that private action even
though the public API correctly returned 404.

Managed-cloud still needs a reproducible way to bind the first verified human
after OIDC login and before company creation.

## Decision

- `/api/v1/bootstrap/claim` remains available only to private self-hosted
  deployments and remains undiscoverable on public exposure.
- An authenticated managed-cloud user without a company or instance role sees
  a waiting state, never a browser field for a bootstrap secret and never a
  claim button.
- The product operator runs `npm run ops:provision-managed-admin` in the server
  environment with the managed database URL and exact verified email. The
  command is accepted only under `COMPANY_OS_PROFILE=managed-cloud`.
- The application resolves only an existing `email_verified=true` Company OS
  auth user, invokes the same race-safe first-admin store contract and returns
  a secret-free status. It is idempotent for the same human and refuses to
  replace a different existing administrator.
- CI runs `npm run test:compose:managed-cloud` against external PostgreSQL and
  Keycloak services, the same API/Web images and migration command used by the
  self-hosted Profile. A real browser logs in, observes the waiting state,
  verifies public claim is 404, receives server-side provisioning, creates the
  company and accountable organization, reloads persisted state and checks
  readiness without route interception.

## Alternatives considered

### Expose first-user-wins on the public API

Rejected because possession of any valid IdP account would become an instance
administrator race.

### Put a bootstrap token in the browser

Rejected because it adds a high-value credential to browser history, logs and
support workflows while still failing to bind a pre-verified enterprise human.

### Insert the role manually with SQL

Rejected because it bypasses identity verification, race handling, validation
and a stable operator contract.

## Consequences

- A platform signup/provisioning service can invoke the command as a narrow
  backend step without gaining access to company data or user tokens.
- The initial managed user must complete OIDC once before provisioning so the
  verified external identity exists locally.
- Customer-facing self-service begins immediately after the platform binding;
  company, organization and responsibility setup stay in Company OS.
