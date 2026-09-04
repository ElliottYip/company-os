# Spec: Customer-selectable SaaS and independent deployment onboarding

Status: Approved by owner
Date: 2026-09-03

## Assumptions

1. A customer chooses one of two supported profiles before entering credentials:
   **shared SaaS** or **independent deployment**.
2. Shared SaaS customers use `https://anc.raft.xin/t/<tenant-slug>` and do not
   need a domain. The existing Zhejiang Leike instance keeps its current root
   URL and database during the rollout.
3. Every customer owns its identity application. Company OS does not reuse one
   customer's credentials or tenant identity for another customer. Feishu is
   the first available managed-cloud adapter; other platforms using standard
   OIDC and customer-owned adapters use the same provider-neutral binding
   contract. Independent deployment may select Feishu, OIDC, or a self-built
   adapter in its handoff.
4. Shared SaaS signup proves control of the Feishu app secret, reads the tenant
   identity from Feishu, then requires a real login from that same tenant before
   the first company Owner is created.
5. Independent deployment is not an unmanaged one-click remote installation.
   Company OS generates a bounded deployment handoff; the customer or operator
   installs it on customer-owned infrastructure after DNS and change approval.
6. Billing, payment collection, marketplace-app publication, SCIM writes, and
   automatic employee import are outside this goal. The directory boundary
   remains read-only.
7. Identity login requests only the minimum sign-in scope by default. Directory
   or organization-chart access is a separate, explicit administrator choice;
   it is never implied by choosing an identity platform.

## Objective

Allow another company to open Company OS, select its deployment mode, and
complete a secure enterprise setup without sharing Zhejiang Leike's domain,
Feishu credentials, database authority, users, or company data.

### Shared SaaS journey

1. Open `/start`, choose **Shared SaaS**, reserve a bounded tenant slug, and
   enter company name plus Feishu App ID and App Secret.
2. Company OS exchanges the credentials only with fixed official Feishu hosts,
   obtains the authoritative tenant key/name, encrypts the secret, and creates
   a short-lived pending registration.
3. The registrant signs in through the exact pending Feishu binding. OAuth
   state and callback provider ID bind the browser, registration, tenant, app,
   PKCE verifier, and expiry.
4. A matching verified Feishu identity atomically creates the company, first
   Owner membership, identity binding, audit event, and tenant route. A user
   from another tenant cannot complete it.
5. Members use the same tenant URL and accept least-privilege invitations. A
   Feishu login alone never grants company membership.

### Independent deployment journey

1. Open `/start`, choose **Independent deployment**, and enter only non-secret
   deployment coordinates.
2. Receive a versioned, checksum-bound handoff describing domain, callback,
   images, database, secret-file inputs, migration, rollback, and acceptance
   commands.
3. Install the same codebase under the `self-hosted` profile. Credentials never
   pass through the shared SaaS database.

## Tech stack

- TypeScript strict-mode ESM on Node.js 22.
- Better Auth and PostgreSQL/Drizzle for identity and durable state.
- Existing provider-neutral core/application/ports boundaries.
- Feishu OAuth 2.0 authorization code with S256 PKCE.
- AES-256-GCM envelope encryption using a root-injected master-key file for
  tenant-owned OAuth secrets; authenticated data binds tenant, binding, secret
  kind, and key version.
- Existing Web client and separate immutable API/Web containers.

## Commands

```sh
npm install
npm run dev
node --experimental-strip-types --test tests/tenant-registration.test.ts tests/tenant-identity-binding.test.ts tests/multi-tenant-auth.test.ts
npm test
npm run typecheck
npm run check:boundaries
npm run security
npm run build
npm run verify
```

## Project structure

- `core/` — provider-neutral tenant registration and deployment-choice types.
- `ports/` — identity-binding, encrypted-secret, tenant-route, and atomic
  registration ports; no Feishu SDK or HTTP concepts.
- `application/` — pending registration, proof completion, company bootstrap,
  expiry, and independent handoff use cases.
- `adapters/identity/` — dynamic Feishu provider resolution and fixed-host
  credential validation.
- `adapters/persistence/postgres/` — additive tables, encrypted envelopes,
  uniqueness constraints, and transactional stores.
- `adapters/http/` — bounded public registration and tenant-aware auth routes.
- `web/` — mode chooser, SaaS binding wizard, verification status, and
  independent handoff UI.
- `tests/` — unit, persistence, HTTP, browser, and adversarial isolation tests.
- `docs/` — operations, customer onboarding, migration, and rollback runbooks.

## Code style

External values are normalized once at the adapter boundary and application
services receive provider-neutral commands:

```ts
const command: BeginTenantRegistrationCommand = {
  mode: "shared-saas",
  slug: parseTenantSlug(body.slug),
  companyName: parseCompanyName(body.companyName),
  identityBindingReference,
  requestedBy: registrationSession.id,
};
await registration.begin(command);
```

Use named exports, immutable input/output types, stable error codes,
parameterized persistence, additive migrations, and opaque portable IDs.

## Data and identity model

### Additive records

- `company_os_tenant_registration`: pending/verified/completed/expired state,
  slug, deployment choice, expiry, attempt counters, and audit timestamps.
- `company_os_identity_binding`: company or pending-registration ownership,
  provider-neutral type, unique public provider ID, external tenant digest,
  public App ID, encrypted-secret reference, status, and revision.
- `company_os_encrypted_secret`: ciphertext, nonce, authentication tag, key
  version, purpose, owner reference, created/rotated/revoked timestamps.
- `company_os_external_identity`: binding, local auth user, external subject
  digest, tenant digest, asserted-email HMAC, and last verification time.

No raw App Secret, OAuth access token, tenant access token, callback code,
session token, or invitation token is returned by registration APIs or written
to operational logs.

### Tenant addressing

- Tenant slugs are lowercase ASCII `[a-z0-9-]`, 3–48 characters, globally
  unique, and immutable after activation.
- Login begins at `/t/<slug>/sign-in`.
- Provider IDs are opaque and binding-specific; callbacks use
  `/api/auth/oauth2/callback/<provider-id>`.
- The provider ID, not a client-supplied App ID or tenant key, resolves the
  encrypted binding.
- The existing root deployment remains an explicit legacy route and is never a
  fallback for an unknown slug.

### Identity isolation

- Better Auth's required email-shaped key is always a tenant-scoped,
  non-deliverable alias for new SaaS bindings, including when Feishu returns an
  enterprise email. This prevents cross-company account linking by shared
  email.
- When an identity adapter supplies a verified enterprise email for invitation
  matching, it is stored only as a tenant-bound HMAC and never used as the
  global auth-user primary identity. The first managed Feishu rollout leaves
  this optional field empty until that invitation capability is enabled.
- Company authorization continues to derive membership from the authenticated
  local user and requested company; URL slug alone grants nothing.

## Threat model

| Threat | Required control |
| --- | --- |
| Attacker reserves another company's slug | Feishu credential proof, short expiry, rate limit, uniqueness, and safe operator recovery |
| Attacker supplies another tenant's App ID/secret | Server obtains tenant key directly from Feishu and binds it to the pending registration |
| OAuth callback is swapped across tenants | Binding-specific provider ID, database OAuth state, PKCE, exact redirect, tenant match |
| App Secret leaks from database/log/API | AES-GCM envelope, root master key outside database, redaction, write-only UI |
| Same email links accounts across tenants | Tenant-scoped auth aliases and binding-scoped external identities |
| User in tenant A reads or mutates tenant B | Membership-derived company authority on every route plus negative cross-tenant tests |
| Public signup exhausts resources | Per-IP limits, one-time registration state, bounded payloads/timeouts, expiry and cleanup |
| Compromised company Owner changes another binding | Company-scoped authorization, revision checks, fresh reauthentication, audit event |
| SSRF through identity configuration | Fixed official Feishu endpoints; no customer-supplied issuer or URL in this flow |
| Secret-master-key compromise | Versioned key rotation, re-encryption job, revoke path, no plaintext export |

## Testing strategy

1. Unit tests: slug/input parsing, state machine, expiry, envelope encryption,
   AAD mismatch, provider-ID derivation, and tenant-scoped identity mapping.
2. Persistence tests: additive migration, atomic completion, uniqueness races,
   replay/idempotency, rotation, and rollback compatibility.
3. HTTP tests: generic errors, size/rate bounds, no secret echo, CSRF/origin
   checks, authorization, and unknown-slug fail-closed behavior.
4. OAuth tests: two synthetic Feishu tenants/apps complete independently;
   swapped state, provider, tenant, subject, callback, and invite all fail.
5. Browser tests: mode selection, SaaS signup, first Owner, member invitation,
   sign-out, and independent handoff download.
6. Production admission: migrate a copy of the current database, verify current
   root login, activate a second synthetic tenant, prove bidirectional denial,
   then canary and cut over with a retained rollback image/database backup.

## Boundaries

### Always

- Preserve `core <- ports <- application <- adapters/web`.
- Validate every external field; use fixed Feishu URLs and bounded responses.
- Derive company authority server-side from session and active membership.
- Use additive migrations and immutable image digests.
- Record secret-free security/audit events and test negative cross-tenant cases.

### Ask first

- Public DNS/TLS changes, production database migration, and traffic cutover.
- Enabling open registration without rate limits or operator suspension.
- Collecting any new category of employee PII.
- Deleting or replacing an activated tenant binding.

### Never

- Store plaintext customer App Secrets or expose them after submission.
- Reuse one company's self-built Feishu app for another company.
- Make first-login-wins a global instance-administrator mechanism.
- Select a tenant solely from a browser-supplied company ID or slug.
- Automatically create membership merely because a person exists in Feishu.
- Put customer credentials into independent-deployment handoff artifacts.

## Success criteria

1. `/start` presents both modes and clearly explains domain/data ownership.
2. A new shared-SaaS customer completes App credential proof, same-tenant real
   login, first-company/Owner creation, and member invitation on the shared
   domain without owning DNS.
3. A new independent customer receives a valid secret-free deployment handoff
   and the existing self-hosted admission accepts it.
4. Two different tenant fixtures can use the same human email without sharing
   auth users, sessions, memberships, company data, secrets, or audit streams.
5. Ten named cross-tenant and callback-swap abuse cases fail before side
   effects and produce no secret-bearing response or log.
6. Secret scan, dependency audit, typecheck, boundary check, unit/integration
   suite, browser suite, migration rehearsal, restart persistence, and rollback
   rehearsal pass.
7. Zhejiang Leike's current root URL, real Feishu login, company, Owner, and
   read-only 14-department/27-human verification remain intact throughout.
8. Production uses immutable images, root-only master-key injection, non-root
   runtime processes, health checks, backup evidence, canary evidence, and a
   documented rollback point.

## Rollout

1. Implement and test behind `COMPANY_OS_MULTI_TENANT_SAAS_ENABLED=false`.
2. Rehearse the additive migration against a database copy.
3. Deploy the new image with registration disabled and verify the existing
   tenant byte-for-byte at public boundaries.
4. Enable `/start` for an allowlisted canary registration; complete a second
   tenant end to end and prove isolation in both directions.
5. Enable bounded public registration only after acceptance evidence and an
   explicit production change authorization.

## Open questions for owner review

The defaults below will be used unless changed before implementation:

1. Shared tenant URLs use `/t/<slug>` under `anc.raft.xin`, not customer
   subdomains.
2. Each customer supplies its own Feishu self-built application.
3. Signup is canary/allowlist-first; unrestricted public signup is a separate
   production switch.
4. Independent deployment produces a handoff and operator workflow rather than
   remotely modifying customer infrastructure.
