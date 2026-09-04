# Company OS product-readiness audit

Date: 2026-08-31
Status: **REPOSITORY PRODUCT CANDIDATE READY; PRODUCTION CUSTOMER ACCEPTANCE REQUIRED**

## Decision

Company OS has no known repository-controlled P0 or P1 product blocker at the
audited revision. The product code, Web surface, deployment contracts,
security checks, recovery controls, and release-shaped verification form a
product candidate that is ready to enter customer staging.

This is not a production-complete claim. The remaining gates require a real
customer-owned environment, named human owners, credentials supplied outside
Git, and explicit staging or production-change authorization. A fixture,
synthetic node, local trusted workspace, release tag, or structurally valid
acceptance record cannot satisfy those gates.

## Exact audited baseline

- Audited implementation revision:
  `4aa4d6666f6f1ae28bd32d7b2c0ff8ec702d61c9`.
- Audited tree: `d04e00e29bdca26178b8eb49cd7ca342829dfac6`.
- `origin/main` revision:
  `ca9900f1505bd413af527e5b5724f6c7ee0a5339`.
- The local annotated `v0.1.0-rc.25` tag resolves to that `origin/main`
  revision. The audited revision, `origin/main`, and `v0.1.0-rc.25` have the
  same Git tree, so the verification below covers the RC25 source content.
- The audit did not modify, delete, or classify the existing untracked 3D,
  experiment, output, or temporary artifacts.

## Current-run repository evidence

`npm run verify` completed with exit code 0 on the audited tree:

- Node test runner: 734 tests; 730 passed, 4 explicit external-environment
  skips, 0 failed.
- Browser admission: 23 tests; 18 passed, 5 explicit external-environment
  skips, 0 failed.
- Dependency-direction and independent-runtime checks passed.
- 3D asset, research provenance, execution-plane OpenAPI, generated Connector
  bundle, and Web-interaction guards passed.
- Secret scanning passed across 1,725 text files.
- Production dependency audit reported 0 vulnerabilities at the configured
  moderate threshold.
- Strict TypeScript checking and the production Vite build passed.
- The Web 3D performance budget passed.

The skipped cases are not hidden failures. They are the deliberately gated
live PostgreSQL/OIDC/Compose cases that require external runtime coordinates;
the repository keeps separate scripts and CI admissions for them.

## Product capabilities already closed in the repository

| Area | Current judgment |
|---|---|
| Architecture | Provider-neutral `core <- ports <- application <- adapters/web` boundary is enforced mechanically; Raft and Paperclip remain adapters, not domain dependencies. |
| Identity and tenancy | Formal OIDC, durable sessions, company membership, invitations, permission-negative cases, first-admin controls, and tenant isolation are implemented and release-shaped. |
| Accountable work | Goal, project, Work, Attempt, approval, evidence, responsibility, cancellation, timeout, safe retry, budget, and audit lifecycles are durable and revision-fenced. |
| Execution plane | Installed Agent, model, Data, Secret Broker, and Federated Source boundaries are fail-closed, secret-free at the control plane, versioned, and restart-safe. |
| Web product | Company-first onboarding, operational pages, bilingual and responsive behavior, keyboard navigation, error recovery, and no-dead-control admission are covered. |
| Deployment and recovery | Managed-cloud and self-hosted profiles, immutable non-root images, migrations, restricted runtime roles, encrypted backup/restore, release handoff, restart, upgrade, rollback, and bounded acceptance windows are implemented. |
| Security and operations | Origin/input limits, transport validation, readiness, fixed-cardinality metrics, structured logs, secret scan, dependency audit, resilience, soak, and browser gates are in the verification chain. |
| Public Alpha | The retained evidence supports a fixture-only public Alpha. It must continue to be labelled Demo/fixture and must not be presented as a customer-connected control plane. |

## What still separates the candidate from production

These are external acceptance gates, not missing repository features.

### P0 — required before any production-complete claim

1. Start an immutable formal release in an isolated customer staging
   environment under a separately authorized change, without reusing the
   public Demo runtime.
2. Capture all nine Level 2 evidence digests from
   `docs/customer-boundary-acceptance.md`: boundary preflight, enterprise
   browser identity, responsibility contract, Agent execution, real model
   execution and usage, Data boundary, Secret lifecycle, idempotency replay,
   and API restart recovery.
3. Repeat the Federated Source path against a customer-owned non-production
   tenant with a minimum-scope revocable credential; prove stable replay,
   revocation denial, rotation recovery, bounded fields, and retained health.
4. Approve and retain all eleven Level 3 production controls: change record,
   certificate chain, network policy, credential rotation ownership, session
   policy, off-site backup destination, retention policy, monitoring route,
   incident contacts, rollback window, and legal-hold policy.
5. Bind the evidence to the exact immutable release in a schema-v2
   coordinate-free acceptance record with named opaque owner IDs. Structural
   validation remains distinct from independent human verification.

### P1 — required for a credible general-availability operating posture

1. Run encrypted backup and restore against the customer-controlled off-site
   destination, then retain recovery-time and data-integrity evidence.
2. Execute two real immutable release upgrades with the implemented frozen
   dispatch, drain, parallel database rollback, bounded traffic observation,
   independent acceptance, and explicit reopen/reject sequence.
3. Configure environment-specific SLOs, alert thresholds, on-call routing,
   incident contacts, and a production-duration soak; rehearse one dependency
   failure and one rollback during the approved window.
4. Obtain explicit product/commercial/legal approval for the supported
   connector set, retention and legal-hold policy, support boundary, and GA
   claim. The repository cannot self-authorize these business decisions.

## One-step completion boundary

The repository-controlled portion of the product-readiness goal is complete:
there is no known code, test, build, boundary, security, or browser P0/P1 to
implement locally. Advancing beyond this point would require authority that
this audit deliberately does not infer: customer credentials, production or
staging runtime mutation, paid model execution, customer data access, DNS/TLS
or public-traffic changes, or formal first start.

The next authorized operation should therefore be a customer-staging
acceptance run generated from the exact release manifest with
`npm run ops:plan:customer-acceptance -- <release-manifest.json> CUSTOMER_STAGING`.
Do not replace that evidence with another fixture-only implementation cycle.
