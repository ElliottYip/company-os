# Tasks: Customer-selectable SaaS and independent deployment onboarding

- [x] Task 1: Define the provider-neutral registration state machine and store contract.
  - Acceptance: invalid slugs, identifiers, expiry, replay, and illegal transitions fail before persistence.
  - Verify: `node --experimental-strip-types --test tests/tenant-registration.test.ts`
  - Files: `core/tenant-registration.ts`, `ports/tenant-registration-store-port.ts`,
    `application/manage-tenant-registration.ts`, `tests/tenant-registration.test.ts`

- [x] Task 2: Add authenticated envelope encryption for tenant-owned secrets.
  - Acceptance: plaintext never enters stored records; wrong owner, purpose, key version,
    nonce, tag, or ciphertext fails closed.
  - Verify: `node --experimental-strip-types --test tests/tenant-secret-envelope.test.ts`
  - Files: `ports/tenant-secret-store-port.ts`, `adapters/security/tenant-secret-envelope.ts`,
    `tests/tenant-secret-envelope.test.ts`

- [x] Task 3: Add additive PostgreSQL schema and transactional registration store.
  - Acceptance: slug, provider ID, App ID/tenant binding, transition revision, and one-time
    completion are constrained in PostgreSQL without changing existing rows.
  - Verify: migration contract tests and a live PostgreSQL persistence test.
  - Files: one migration, schema declarations, PostgreSQL store, migration test, live store test.

- [x] Task 4: Validate a pending Feishu binding against fixed official endpoints.
  - Acceptance: credentials are proved, tenant coordinates are bounded, and responses contain
    neither App Secret nor access token.
  - Verify: Feishu binding tests for success, timeout, malformed data, and mismatched tenant.
  - Files: adapter, tests, and neutral verification port if required.

- [x] Task 5: Route tenant-scoped OAuth without cross-tenant provider fallback.
  - Acceptance: `/t/<slug>/sign-in` resolves one active binding; provider IDs are binding-specific;
    state/PKCE/callback/tenant swaps fail before identity or membership creation.
  - Verify: two-tenant auth and callback-swap tests.
  - Files: provider adapter, auth router, service composition, and focused tests.

- [x] Task 6: Atomically complete SaaS registration as first company Owner.
  - Acceptance: same-tenant verified identity creates one company/Owner/binding/audit stream without
    global instance-admin authority; replay is idempotent and races cannot create two companies.
  - Verify: application, PostgreSQL, and HTTP tests.
  - Files: application service, port extension/store, HTTP route, tests.

- [x] Task 7: Add bounded public registration APIs behind a disabled-by-default flag.
  - Acceptance: origin, CSRF, input size, expiry, rate, secret redaction, and generic errors pass
    adversarial HTTP tests.
  - Verify: focused HTTP tests plus secret scan.
  - Files: HTTP contracts, service entry composition, rate-limiter integration, tests.

- [x] Task 8: Add the Web mode chooser and both onboarding journeys.
  - Acceptance: shared SaaS and independent deployment are clearly distinct; App Secret is
    write-only; tenant URL and handoff are accessible and keyboard-usable.
  - Verify: Web contract tests, build, and browser tests.
  - Files: Web mount/client/styles, browser test, copy tests.

- [x] Task 9: Generate a secret-free independent-deployment handoff.
  - Acceptance: artifact binds release, domain, callback, images, migration, acceptance, and rollback;
    contains no credential material.
  - Verify: handoff validator and self-hosted admission.
  - Files: application generator, HTTP adapter, validator, tests, operations doc.

- [ ] Task 10: Qualify, migrate, canary, and deploy.
  - Acceptance: full verification passes; copied production database migration passes; current root
    tenant remains healthy; a second tenant completes end to end; denial works in both directions;
    backup and immutable rollback point are retained.
  - Verify: release manifest, deployment evidence, live browser/API/database checks, rollback rehearsal.
  - Files: deployment profile, runbooks, acceptance evidence, and versioned migration artifacts.
