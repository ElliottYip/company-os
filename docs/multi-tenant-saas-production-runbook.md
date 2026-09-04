# Multi-tenant SaaS production runbook

This runbook upgrades the existing `anc.raft.xin` / `api.anc.raft.xin`
deployment without changing DNS or replacing the current Zhejiang Leike
tenant. The additive database migration is installed before the feature is
enabled. Every traffic-changing step requires action-time operator approval.

## Bound release candidate

- API image: `company-os-api:multi-tenant-legacy-reserved-amd64`
  (`sha256:1016d4db7202d351565a944d5968019b1ad87827633d9bb570f6d4ce1a650bf7`)
- Web image: `company-os-web:multi-tenant-preserved-home-provider-aware-amd64`
  (`sha256:8467e9c12c42406c51cf3861f4e64f07c3118a3c718cc8b9249f8c96d65d0c51`)
- Web transfer archive: `/tmp/company-os-web-multi-tenant-provider-aware-amd64.tar.gz`
  (`sha256:79a6fe65f87bb07316edc931a0eec6c7cd8c80215e35b6af0e9f821f9213edf5`,
  110,997,280 bytes, mode `0600`)
- Transfer archive SHA-256:
  `033e842156f41cfbec6c1bfcb6988a3d085de928bc2d507aa02deaede97c62ff`
- Operations image: `company-os-ops:multi-tenant-file-secret-ready-amd64`
  (`sha256:2d1cb2a530084dc07009b22e673ae0c74a115f7eaac3325697d2e944aef52974`)
- Operations archive SHA-256:
  `2d2a0e387e857a344c7ca6846625dc7c6121907379939f4670d446a360f29ee3`
- Target architecture: `linux/amd64`
- Current rollback API digest:
  `company-os-api@sha256:989710cca8c4981708c9084f1f005cb00579ab6ec3aeb412321a33493f42e228`
- Current active Web digest (changed concurrently after the initial snapshot):
  `ghcr.io/elliottyip/company-os-web@sha256:7b5c0f43baa5ec9c86ab484cab14ad6e5fd3bb20ac23df9bcf732db1ed8004e8`
- Earlier rollback-snapshot Web digest:
  `company-os-web@sha256:0b37f8e3d718315cbf95a117fc218ac8012177aa74640ccb3e2674475246f2a8`

The earlier multi-tenant Web candidate
`sha256:14d768963d25fadb804c4d88339ec9c9ed271bbe98dd7c3712d82bb8fcf999e8`
is rejected for deployment because it did not preserve the active front-door
asset set. The replacement overlays only the tenant entry on the exact active
production Web image. Its provider-aware compatibility bridge follows the
server-selected legacy identity provider instead of retaining the baseline
bundle's hard-coded `enterprise-oidc` value.

The candidate archive contains private source-derived artifacts. Upload it
only after explicit authorization and retain it in an operator-only path.

Phase 1 completed at `2026-09-03T05:04:14Z`. The archive hashes and loaded
image IDs matched, the encrypted backup authenticated, the isolated restored
copy migrated from 7 to 8 without changing any existing control total, and the
copy-only API/Web canaries passed. Exact evidence is retained in
`docs/acceptance/2026-09-03-multi-tenant-production-rehearsal.json`. Production
phase 2 completed at `2026-09-03T05:40:39Z`: migration 0008, runtime-role
provisioning, provider-aware Web, and candidate API are live while multi-tenant
signup remains disabled. The first runtime attempt was rolled back when a real
browser exposed the baseline provider mismatch; the corrected retry passed
real Chromium login against both the pre-attempt and candidate APIs. Exact
evidence is in
`docs/acceptance/2026-09-03-multi-tenant-production-phase2-attempt.json`.

## Phase 1: no-traffic preparation

1. Upload the candidate archive to an operator-only temporary path, verify its
   SHA-256, load it into Docker, and record the loaded image IDs.
2. Copy the current Compose file and image coordinates into an immutable
   rollback directory. Do not overwrite the running Compose file. Recheck its
   digest immediately before the copy: the production Web changed concurrently
   after the first snapshot, so that earlier snapshot is historical evidence,
   not authority for a later cutover.
3. Create an encrypted PostgreSQL backup with both the database coordinate and
   AES-256-GCM key injected from private files, then authenticate its manifest.
4. Restore the backup into a new isolated PostgreSQL 16 volume/database with
   `COMPANY_OS_RESTORE_SCHEMA_VALIDATION=CONNECTIVITY_ONLY`; inject the restore
   database coordinate through `COMPANY_OS_RESTORE_DATABASE_URL_FILE`.
5. Run all migrations, including `0008_multi_tenant_registration.sql` and the
   additive `0009_tenant_signup_invites.sql`, against
   only that restored copy.
6. Verify migration journal, existing company/user/event counts, current root
   identity rows, new constraints, and absence of plaintext identity secrets.
7. Start the candidate API and Web against the restored copy on loopback-only
   canary ports with `COMPANY_OS_MULTI_TENANT_SAAS_ENABLED=false`.
8. Verify `/health`, `/ready`, the unchanged home page, current root sign-in
   routing, and `/start`. Stop the copy-only canary after evidence capture.

## Phase 2: additive production upgrade, feature disabled

After explicit cutover approval:

1. Retain the paired encrypted backup, prior images, prior Compose file, and
   restore result.
2. Run the additive migration job once, then replace API and Web with the bound
   candidate images while keeping multi-tenant registration disabled.
3. Verify the Zhejiang Leike root route, Feishu login, company projection,
   organization counts, session persistence, and the absence of new errors.
4. If any root check fails, redeploy the prior images. If schema compatibility
   is insufficient, restore the paired backup into a parallel database and
   switch to it; never restore over the live database.

## Phase 3: invitation-gated tenant registration

1. Create `/etc/company-os/feishu-secrets/tenant-secret-master-key` with the
   idempotent `deploy/provision-multi-tenant-master-key.sh`; never print it.
2. Generate high-entropy one-use invitation codes with
   `npm run ops:generate:tenant-signup-invites -- OUTPUT_DIRECTORY COUNT`.
   Deliver the plaintext code file only to the accountable operator. Install
   only `tenant-signup-invite-hmac-key` and `tenant-signup-invite-digests` as
   root-owned mode `0400` runtime files.
3. Set `COMPANY_OS_MULTI_TENANT_SAAS_ENABLED=true`, keep
   `COMPANY_OS_TENANT_PUBLIC_SIGNUP_UNRESTRICTED=false`, and leave the App ID
   allowlist empty when every shared SaaS registration must carry an invitation.
   Restart only after configuration validation.
4. Register the canary company at `/start`, confirm that its invitation is
   atomically redeemed once and its Client Secret is
   cleared from the browser and stored only as AES-256-GCM ciphertext.
5. Complete OAuth at `/t/<slug>`, create exactly one company and Owner, then
   create an organization and invite a second member.
6. Accept the member invitation through the same tenant identity binding. Verify the
   tenant-bound asserted-email HMAC and ensure no raw asserted email is used as
   the global auth identity.
7. Prove bidirectional denial: tenant A cannot read, mutate, accept invitations
   for, or use the OAuth callback/provider ID of tenant B, and vice versa.
8. Keep unrestricted public signup disabled until monitoring, support, abuse
   response, and customer onboarding ownership are accepted.

### Account-free public smoke

Run this after every Web/API release when a second-company Feishu account is
not available:

```sh
npm run ops:smoke:multi-tenant-public
```

The command uses a random nonexistent tenant, a syntactically valid but
unissued signup code, and dummy app material. It proves that `/start` is
available, invalid invitations fail before credential verification, and both
unknown tenant sign-in and unknown binding callbacks fail closed. It needs no
Feishu account or customer secret and must not create a registration, binding,
or invitation redemption. Verify the three corresponding database counts are
unchanged when capturing production evidence.

This smoke is deliberately non-destructive. It does not prove a real Feishu
authorization, first Owner creation, member invitation acceptance, or
organization-directory access, so it cannot replace steps 4–7 above.

## Required evidence

- full `npm run verify` result for the bound source tree;
- candidate image IDs and archive digest;
- authenticated backup and isolated restore manifests;
- copied-database migration result and before/after invariant counts;
- root-tenant login and data smoke result before and after replacement;
- second-tenant registration, Owner creation, member invitation/acceptance;
- bidirectional authorization and callback-swap denial results;
- final Compose digest, configuration with values redacted, and rollback path.

The rollout is incomplete until every item exists and the operator has retained
the rollback database and prior immutable images.
