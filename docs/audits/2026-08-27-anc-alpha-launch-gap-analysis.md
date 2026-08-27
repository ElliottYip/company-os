# ANC Alpha launch gap analysis

Date: 2026-08-27  
Baseline: RC14 / `HK_RC14_PUBLIC_ALPHA_DEMO_ACCEPTED`

## Current truth

- RC14 is published and publicly routed at the ANC-prefixed HTTPS origins as a
  fixture-only Alpha Demo. RC13 remains running as the immediate rollback
  candidate; RC4 through RC14 and the prior prepare-only evidence are retained.
- RC14 health/readiness, two-visitor isolation, governed pause/approval/reset,
  formal-route denial, API restart/recovery, responsive bilingual browser E2E,
  and the 30-minute 180-sample public observation all pass with zero P0/P1.
- A pinned Paperclip `v2026.817.0` adapter now implements credential-file-only
  Agent inventory and Federated Issue synchronization behind an authorized
  formal trigger. Current demonstrations still use explicit fixtures, and no
  sandbox credential is installed on the Hong Kong Demo. A separate local
  authenticated sandbox has accepted anonymous denial, official API sync and
  fail-closed key revocation, but the formal OIDC route is not live-accepted.
- The formal-only Compose overlay now admits both self-hosted and managed-cloud
  profiles, mounts the credential by path only, rejects unsafe file ownership,
  links and permissions, and re-reads it on every upstream request for rotation
  without an API restart. It is absent from the public Demo profile.
- Therefore the public Alpha Demo is available, while the private OIDC Alpha
  remains deliberately unstarted and is not yet a customer-connected control
  plane.

## Retain

- RC4–RC7 tags, digests, release directories, and prepare-only evidence.
- Formal OIDC, membership, Secret-reference, PostgreSQL, migration,
  backup/restore, rollback, responsibility, approval, evidence, and audit
  contracts.
- Provider-neutral Agent Portfolio, Work, commercial, and Connector capability
  contracts.
- Fixture labels, Demo Session isolation, bilingual Web shell, and browser E2E.

## Public Demo completion

| Gap | Required result |
|---|---|
| Requirement | Current result |
|---|---|
| Separate no-Secret, no-egress runtime | Passed in `compose.public-demo.yml`. |
| Bounded anonymous sessions and throttling | Passed. |
| Hong Kong single-replica runtime | RC14 API/Web healthy and publicly routed. |
| DNS and TLS | Both ANC-prefixed names independently resolve and share a valid certificate. |
| Browser and recovery | Public HTTPS journey, isolation, reset, restart, bilingual and formal denial passed. |
| Observation | 1803 seconds, 180 samples, 360 probes, zero failures/P0/P1. |

## Private Alpha and real Connector gaps

| Gap | Required result |
|---|---|
| External platform selected but not customer-accepted | Paperclip `v2026.817.0` official API and key revocation pass an authenticated synthetic sandbox; repeat through a customer-owned non-production tenant before claiming it live. |
| No formal-runtime sandbox credential | The file-only deployment boundary and both Compose profiles now pass preflight; obtain a minimum-scope, revocable customer test credential without placing it in Git, Demo, logs, or browser storage. |
| Adapter not target-accepted | Inventory and Federated Work are implemented in the optional Connector package; truthful Usage remains disabled because the official cost API is aggregate rather than event-level. |
| No authenticated Alpha runtime | Configure OIDC and company membership separately from the anonymous Demo, with Connector access denied outside the bound company. |
| No live acceptance | Prove at least one real inventory sync and one platform-supported Observed or Federated Work/usage round trip with source references and audit evidence. |

## Stop gates requiring user confirmation

- selecting a platform when available sandbox credentials differ materially;
- transmitting or installing any credential;
- any paid model/API call or production-data access;
- DNS/TLS or public traffic change;
- formal-mode first start.

## Completion evidence

The Alpha goal closes only with a new immutable RC, full `npm run verify`,
release CI, migration preflight, rollback/withdrawal plan, target-host health and
browser artifacts, a 30-minute observation record, and one real sandbox
Connector acceptance. Passing fixtures alone is insufficient.
