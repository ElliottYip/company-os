# ANC public Demo RC28 publication acceptance

Date: 2026-09-03  
Public origins: `https://anc.raft.xin`, `https://api.anc.raft.xin`  
Outcome: **ACCEPTED**

## Immutable release coordinates

- Release tag: `v0.1.0-rc.28`
- Release ID: `0.1.0-rc.28-eafa6d656907`
- Source revision: `eafa6d656907762d87b6b3dca95183cc74e5ee81`
- Protected workflow: `33705349060`, attempt 2; `qualify` and `publish` succeeded.
- Published manifest SHA-256: `c36a0c688ab7a0ce0d4367c31f806e93927fd64110da2f25fa853fa330f54a80`
- Staging bundle manifest SHA-256: `6b64b694e54f60a606805e2f09896b9539314f885b3fba2f79e957c2369171a9`
- Portable handoff archive SHA-256: `700eb9289384fa30fb90997bae5a6f5e3800a28fa879a9a2a38210bc8d5fdfed`
- API image: `ghcr.io/elliottyip/company-os-api@sha256:9501f8e88dc44f80977c4bf84cd4da4a0ae08847c6c3b3616450b086116d464b`
- Web image: `ghcr.io/elliottyip/company-os-web@sha256:a5e7258f9bd7bd251b20c277a2a57bdad9dc535122aceef06cb7e98f996899bc`
- Ops image used for prepare-only admission: `ghcr.io/elliottyip/company-os-ops@sha256:3996280ff615745b0fa726663117be7d67432bfc3193ca4937ba22e7ba9f4772`

## Qualification and closed-ingress acceptance

- The protected workflow passed the full repository gate, real Keycloak OIDC,
  PostgreSQL restore/encryption/role/upgrade gates, verified TLS boundaries,
  Vault compatibility, soak, and both release-shaped Compose profiles.
- The independently generated handoff passed the exact allowlist and contained
  no Secret material. The remote archive digest matched the local digest.
- The attested Ops image returned `PLANNED_NOT_APPLIED` before the explicit
  prepare-only install, which then returned `INSTALLED_NOT_STARTED` for the
  immutable RC28 release directory.
- RC28 ran on the isolated internal network `172.31.28.0/28`; RC19 remained
  public throughout candidate acceptance.
- Health and readiness passed. Readiness explicitly reported the external
  connector, model, Secret broker, Data runtime and formal database disabled.
- Two-visitor isolation, governed pause/decision/evidence, credential renewal,
  reset and formal-route denial passed.
- Process recovery passed: the pre-restart session failed closed and recovery
  created a new isolated Demo fixture. The one-time token was not disclosed and
  was securely removed after acceptance.
- The candidate completed its observation window healthy, with zero automatic
  restarts and no OOM events.

## Public cutover and browser acceptance

- The Nginx candidate differed from RC19 only in its comment and the API/Web
  internal upstream addresses. DNS, TLS material and server names were not
  changed.
- The enabled Nginx symlink was moved atomically. Two guarded attempts returned
  to RC19: the first observed the old worker immediately after reload; the
  second exposed an incorrectly quoted shell content assertion. Neither event
  represented an RC28 application failure. The corrected bounded probe then
  accepted RC28 and retained automatic RC19 rollback on failure.
- Independent-network HTTPS checks returned HTTP 200 and
  `x-company-os-release-id: 0.1.0-rc.28-eafa6d656907` from both Web and API.
- Public API acceptance passed two-visitor isolation, governed approval and
  evidence, renewal/reset, and formal-route denial after cutover.
- The release-owned UI contract suite passed against the public TLS origins for
  English and Chinese at 1440x900 and 1024x768: **4 passed in 56.6 seconds**.
  It verified the shared typography token contract, no horizontal overflow,
  key page navigation, right-edge evidence drawer placement, Escape close and
  focus restoration, viewport-centered rejection/renewal modals, rejection,
  and token renewal.
- A preliminary run reused the local suite's 30-second whole-journey timeout.
  It produced stage-dependent timeouts, including after visible dialogs, while
  one complete 1024px journey passed. Re-running the required 1440/1024 matrix
  with a 90-second public-network budget passed all four cases, demonstrating
  latency-bound truncation rather than a UI or workflow defect.
- The legacy public screenshot helper still expects a superseded English home
  heading and therefore is not release evidence for RC28. The maintained UI
  contract suite and the repository's before/after matrices are authoritative.

## Rollback and retained evidence

- Active Nginx target:
  `/srv/company-os/staging/config/candidates/company-os-public-demo-rc28.nginx.conf`
- Immediate rollback target:
  `/srv/company-os/staging/config/candidates/company-os-public-demo-rc19.nginx.conf`
- RC19 API and Web containers remain healthy with zero restarts and retain the
  release header `0.1.0-rc.19-ac4af376c84b` on their internal addresses.
- RC28 API and Web containers are healthy with zero automatic restarts and no
  OOM events.
- The traceable visual gap list, typography token contract, secondary
  interaction contract, migration record, before/after screenshot matrices and
  pre-release acceptance remain under `docs/ui-consistency/` and the referenced
  `output/playwright/` manifests.

## Boundary statement

This release changes presentation and client interaction only. It does not
change the Company OS product model, information architecture, responsibility
or approval meaning, evidence admission, Demo/formal separation, credentials,
production data, DNS/TLS, or formal Runtime. The public profile remains a
deterministic, Secret-free Demo with no external calls.
