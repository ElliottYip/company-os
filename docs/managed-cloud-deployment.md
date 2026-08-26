# Managed-cloud deployment contract

The managed-cloud profile runs the same Company OS API, Web build and ordered
PostgreSQL migrations as self-hosted. The reference Compose file documents the
portable service contract; a production Kubernetes, Nomad or managed-container
implementation may express it differently without changing business code.

## Ownership boundary

| Capability | Product operator | Customer / enterprise owner |
| --- | --- | --- |
| Company OS API, Web, migrations and runtime-role provisioning | Builds, signs, deploys and monitors | Selects admitted release/channel |
| PostgreSQL | Operates encrypted tenant-isolated service and recovery | Owns retention/export policy |
| Enterprise identity | Validates product-scoped OIDC audience and membership | Owns IdP users, MFA and group policy |
| Secret material | Stores only deployment secrets in platform manager | Keeps model/Agent/data credentials behind Broker references |
| Agent and data execution | Operates neutral control plane and protocol | May operate local Connector/Data nodes and outbound policy |
| Responsibility evidence | Preserves exact bindings and digest metadata | Defines accountable humans, approval and retention policy |

## First managed administrator

Public deployments never expose the private first-user claim endpoint. The
intended bootstrap sequence is:

1. The intended administrator completes OIDC login once. Company OS persists
   only the verified product-scoped identity and session.
2. The platform provisioning service runs the server-side command with
   operator-controlled environment values:

   ```sh
   COMPANY_OS_PROFILE=managed-cloud \
   COMPANY_OS_DATABASE_URL=<secret-managed-runtime-postgresql-url> \
   COMPANY_OS_PROVISION_ADMIN_EMAIL=<exact-verified-email> \
   npm run ops:provision-managed-admin
   ```

3. The user refreshes Company OS and creates the first company and accountable
   organization through the normal Web flow.

The command does not accept arguments, tokens, client secrets or session
material. It refuses an unknown/unverified email and cannot replace another
administrator. Production automation should inject the database URL from its
secret manager and retain the secret-free command result as provisioning
evidence.

Managed deployments inject two different database coordinates. The one-shot
migration and `provision-runtime` jobs receive
`COMPANY_OS_MIGRATION_DATABASE_URL`; the long-running API and managed-admin
provisioning receive only `COMPANY_OS_DATABASE_URL` for the restricted runtime
role. `COMPANY_OS_RUNTIME_DATABASE_PASSWORD` is a secret-manager value used to
create or rotate that role and never enters the API container.

## Release admission

1. Build API, Web, operations, Codex Agent Node and Vault Secret Broker images
   from one exact source revision and their pinned runtime versions.
2. Scan dependencies and source, then produce and retain a CycloneDX or SPDX
   SBOM from that exact dependency graph.
3. Publish images by immutable digest and generate the release manifest:

   ```sh
   COMPANY_OS_RELEASE_VERSION=0.1.0 \
   COMPANY_OS_SOURCE_REVISION=<40-hex-commit> \
   COMPANY_OS_API_IMAGE=<registry/api@sha256:64-hex> \
   COMPANY_OS_WEB_IMAGE=<registry/web@sha256:64-hex> \
   COMPANY_OS_OPS_IMAGE=<registry/ops@sha256:64-hex> \
   COMPANY_OS_CODEX_AGENT_NODE_IMAGE=<registry/codex-agent-node@sha256:64-hex> \
   COMPANY_OS_VAULT_SECRET_BROKER_IMAGE=<registry/vault-secret-broker@sha256:64-hex> \
   node scripts/create-release-manifest.mjs > company-os-release.json
   ```

4. Restore the latest eligible backup to an isolated target. Run the new
   migration job, `/ready`, tenant-count/digest checks and full product smoke.
5. Drain new dispatch, preserve in-flight Attempt state, run the migration once,
   replace API, then Web. Resume only after the smoke path succeeds.

The release-shaped admission is executable locally and in CI:

```sh
npm run test:compose:managed-cloud
```

It uses temporary external PostgreSQL and Keycloak services, performs the
least-privilege role split and server-side verified-human provisioning step,
then drives the complete browser bootstrap without request interception or
production credentials.

The manifest contains no credentials and may be retained with public release
provenance. The SBOM is produced by release automation rather than committed as
a stale snapshot.

An exact SemVer release tag starts the protected workflow. It first runs a
read-only `qualify` job against the exact tagged revision. It includes the complete repository gate, real
PostgreSQL recovery/upgrade/role checks, Keycloak, verified-TLS customer
boundary preflight, the sustained HTTP soak and both Compose profiles. Only the
dependent `publish` job receives package, attestation and release-write
permissions. The five images, their attestations, the manifest and the SBOM are
created before the GitHub Release is published; prerelease tags remain visibly
marked as prereleases.

## Rollback and exit

Before migration, retain the exact release manifest, encrypted database backup
and restore-drill result. If the prior API supports the migrated schema, it may
be redeployed by digest. Otherwise restore the paired backup into a parallel
database and cut traffic over after identity and tenant verification. Never
overwrite the live database to test a restore.

A tenant exit uses the authenticated, company-scoped portability export for
product data plus the operator recovery export for database-level disaster
recovery. External credentials, provider sessions and private reasoning are not
stored in Company OS and therefore remain with their owning Broker/Connector.
