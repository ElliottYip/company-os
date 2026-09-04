# Multi-tenant SaaS local qualification — 2026-09-03

Status: `PASS_LOCAL / PASS_PRODUCTION_PHASE2_FEATURE_DISABLED`

## Proven locally

- `npm run verify`: passed after the provider-neutral onboarding implementation.
- Unit/contract suite: 790 tests, 785 passed, 5 environment-gated skips, 0 failed.
- Browser suite after activation work: 26 tests, 21 passed, 5 external-service
  skips, 0 failed.
- Real disposable PostgreSQL 16 migration and transaction test: 2 passed,
  including one Owner, non-member denial, active-member access, encrypted
  tenant binding, asserted-email HMAC persistence, and safe reuse of a slug and
  identity application after the pending registration expires and its old
  binding/secret ciphertext are removed.
- TypeScript, inward dependency boundaries, Web interaction guard, Secret scan,
  production Web build, and production dependency audit passed.
- Existing home page remains the entry surface. The deployment/provider choice
  is the later `/start` page.
- Managed onboarding returns and client-validates the exact tenant/provider
  HTTPS OAuth callback. The administrator must save it at the selected identity
  platform before starting the first Owner login.

## Candidate artifacts

- API: `linux/amd64`,
  `sha256:1016d4db7202d351565a944d5968019b1ad87827633d9bb570f6d4ce1a650bf7`
- Web (preserved-home overlay): `linux/amd64`,
  `sha256:8467e9c12c42406c51cf3861f4e64f07c3118a3c718cc8b9249f8c96d65d0c51`
- Web transfer archive:
  `/tmp/company-os-web-multi-tenant-provider-aware-amd64.tar.gz`; SHA-256
  `79a6fe65f87bb07316edc931a0eec6c7cd8c80215e35b6af0e9f821f9213edf5`;
  110,997,280 bytes; mode `0600`.
- The preserved-home overlay is based on the exact active production Web
  digest. Excluding only `tenant.html` and its `tenant-*` assets, all 111
  existing files retain the baseline manifest
  `72645bef95f2778930e8ad3051b9287789527ff785d32d4b3b36bda6146a9a7a`.
- The earlier Web candidate
  `sha256:14d768963d25fadb804c4d88339ec9c9ed271bbe98dd7c3712d82bb8fcf999e8`
  is superseded and must not be deployed because it did not retain the active
  front-door assets.
- Local archive: `/tmp/company-os-multi-tenant-file-secret-ready-amd64.tar.gz`
- Archive SHA-256:
  `033e842156f41cfbec6c1bfcb6988a3d085de928bc2d507aa02deaede97c62ff`
- Operations image: `linux/amd64`,
  `sha256:2d1cb2a530084dc07009b22e673ae0c74a115f7eaac3325697d2e944aef52974`
- Operations archive:
  `/tmp/company-os-ops-multi-tenant-file-secret-ready-amd64.tar.gz`
- Operations archive SHA-256:
  `2d2a0e387e857a344c7ca6846625dc7c6121907379939f4670d446a360f29ee3`
- The encrypted restore entrypoint accepts the target database coordinate and
  backup key through private files. Previous-release restore uses an explicit
  connectivity-only validation mode before the separate forward migration.
- Disposable PostgreSQL 16 encrypted-backup admission: `PASS`; authenticated
  ciphertext digest
  `sha256:d4558522cfbe6cfd835ed58121cb830f7b0e15f5192957dc1cef1ea29c97636e`;
  plaintext artifacts: `0`.

## Production no-traffic baseline

Captured read-only at `2026-09-03T04:27Z` before any migration, restart, or
traffic change:

- API `/health`: `ok`; `/ready`: database and formal configuration `pass`.
- Existing optional Connector, model, Secret Broker, and Data runtimes remain
  uninstalled/degraded exactly as before this candidate.
- Durable control totals: 1 company, 1 auth user, 1 auth account, 1 active
  session, 1 membership, 1 domain event, 8 permission grants, 0 invitations.
- Migration journal count: 7. The isolated rehearsal must retain every control
  total and advance the copied database to 8 migrations only.
- At initial capture the running API/Web containers were on image IDs
  `sha256:989710cca8c4981708c9084f1f005cb00579ab6ec3aeb412321a33493f42e228`
  and
  `sha256:0b37f8e3d718315cbf95a117fc218ac8012177aa74640ccb3e2674475246f2a8`.
- A later read-only check found a concurrent, independently performed Web-only
  update at `2026-09-03T04:38:44Z`. API and PostgreSQL remained healthy and
  unchanged; active Web is now
  `sha256:7b5c0f43baa5ec9c86ab484cab14ad6e5fd3bb20ac23df9bcf732db1ed8004e8`.
  The only Compose difference from the first snapshot is that Web image line;
  current Compose SHA-256 is
  `7d3c4922c1785eb764d640cb2933d69690406aa4ffc88ffdf7b7fec34ea33a97`.

## Not yet claimed

- Earlier callback-ready API/Web/operations candidates were uploaded and loaded
  but are superseded by the file-secret-ready candidate above and must not be
  deployed. The final file-secret-ready archives have not been uploaded.
  Running containers remain on the healthy API and independently updated Web
  images recorded above.
- A root-only rollback snapshot was created at
  `/srv/company-os/feishu-production/rollback/20260903T0427Z-multi-tenant-prep`.
  Its Compose digest is
  `06564d1c9a4e39fd8f3ee09df23f5496099c0f13f7fb1c52403a658a1c4f9983`
  and its ingress-config digest is
  `f67ee8193dba859657838279e5877a92cbfa53d16f9dc4d29ca4a35016382d48`.
- The final file-secret-ready archives were explicitly authorized, uploaded,
  hash-matched, set to mode `0600`, and loaded without starting or replacing a
  production service.
- A production AES-256-GCM backup and an isolated direct-stream restore passed.
  The copied database advanced from migration 7 to 8 with every pre-existing
  control total unchanged. Candidate API/Web copy-only canaries passed and were
  removed; the stopped isolated database and volume remain available.
- Production phase 2 completed at `2026-09-03T05:40:39Z`: migration 0008,
  runtime-role provisioning, provider-aware Web, and candidate API are live
  with multi-tenant signup still disabled. Existing control totals are
  unchanged and all new tenant tables remain empty.
- The first runtime attempt exposed an independently introduced baseline Web
  bug that requested `enterprise-oidc` against the Feishu deployment. Runtime
  rollback succeeded; the replacement then passed remote admission and real
  Chromium login with both the pre-attempt and candidate APIs. See
  `2026-09-03-multi-tenant-production-phase2-attempt.json`.
- A real second-company Feishu App ID/Secret and two real users are still
  required for the final cross-tenant production acceptance.

These missing items are production gates, not local-test substitutions.
