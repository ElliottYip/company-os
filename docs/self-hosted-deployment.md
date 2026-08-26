# Self-hosted deployment

Status: release-shaped deployment profile with real database, identity,
least-privilege, encrypted recovery, restart and verified-TLS boundary gates.
Real customer staging and production sign-off remain external acceptance.

Company OS ships one codebase with separate PostgreSQL, migration, API and Web
lifecycles. The Web image is immutable: `COMPANY_OS_WEB_API_URL` and mode are
injected by the Web server at container start, so changing an API hostname does
not rebuild or fork the customer UI.

The API source entry point defaults to `127.0.0.1` for direct local
development. The production API image instead defaults `COMPANY_OS_HOST` to
`0.0.0.0` so Docker bridge traffic can reach port 4310; deployment profiles
still control host exposure through explicit `ports` bindings and a reverse
proxy. Do not publish the API port broadly when a private proxy boundary is
intended.

## Prerequisites

- Docker Engine with Compose v2.
- An enterprise OIDC application whose callback exactly matches
  `COMPANY_OS_OIDC_REDIRECT_URI`.
- HTTPS public Web and API endpoints for every non-loopback deployment.
- Operator-controlled values for distinct migration-owner and API-runtime
  database passwords, the OIDC client secret and a random session-signing key
  of at least 32 bytes.

Company OS does not accept provider or Agent credentials in its database or
deployment file. Install a Secret Broker and bind opaque references instead.
The maintained HTTP Data Node is selected with
`COMPANY_OS_DATA_CONNECTOR_PACKAGES=@company-os/http-data-node-connector`.
Its transport token belongs in the operator-controlled environment, while
enterprise records stay behind the customer node and only opaque references,
evidence references and SHA-256 digests return to Company OS.

## Optional maintained Vault Broker

The maintained Vault adapter can run as a separate deployment unit:

```sh
docker compose \
  --env-file deploy/self-hosted.env \
  -f deploy/compose.self-hosted.yml \
  -f deploy/compose.vault-broker.yml \
  up -d
```

Vault itself remains customer infrastructure. Mount AppRole and Broker
authorities from the configured absolute secret directory, mount only
metadata/profile JSON from the config directory, and terminate verified HTTPS
at the customer ingress. The loopback-published Broker port must not be exposed
directly to a user network.

## Start an isolated instance

1. Copy `deploy/self-hosted.env.example` to a file outside version control.
2. Replace every `CHANGE_ME` value and restrict the file to its operator.
3. Validate the resolved topology before starting:

   ```sh
   docker compose --env-file /secure/path/company-os.env \
     -f deploy/compose.self-hosted.yml config --quiet
   ```

4. Build and start. Compose waits for PostgreSQL, runs the one-shot migration,
   provisions/refreshes a distinct least-privileged runtime role, starts the API
   with only that runtime credential, and starts Web only after API health
   succeeds:

   ```sh
   docker compose --env-file /secure/path/company-os.env \
     -f deploy/compose.self-hosted.yml up --build -d
   ```

5. Check liveness at `/health` and traffic admission at `/ready`. A healthy
   process is not necessarily ready; do not route production traffic while
   `/ready` returns `503`.

The published container ports default to Web `8080` and API `4310`, but the
formal profile deliberately has no insecure public-URL defaults. Put both
services behind the enterprise TLS ingress and set their exact HTTPS origins.
For loopback-only development, use `npm run dev`; do not weaken the formal
identity contract to make the deployment example act like a development server.

`POSTGRES_USER` is the schema/migration owner and never enters the API service.
`COMPANY_OS_RUNTIME_DATABASE_USER` is restricted to connect, schema usage and
the table/sequence DML needed by Company OS; it has no superuser, database,
role, replication, bypass-RLS, schema-create, temporary-table, truncate,
reference or trigger authority. Run `npm run test:runtime-role:postgres16` to
reproduce the real PostgreSQL permission admission.

Set `COMPANY_OS_RETENTION_POLICY_ID` to the stable identifier of the customer
and operator's approved retention contract. Company OS displays this reference
in Settings and binds it into company closure; the browser cannot replace it.
The identifier does not encode an erasure deadline, and Company OS does not
perform physical deletion or legal-hold release from this setting.

Set `COMPANY_OS_ACCOUNTABILITY_EXPORT_POLICY_ID` to the stable reference for
the customer's approved accountability-export contract. The default is
`standard-accountability-export`. The server embeds it into every governed
accountability package; the browser cannot replace it. The reference should map
to an operator-controlled allowlist, review purpose, and external handling
procedure, and must not contain a destination URL or credential.

Private deployments may enable the bounded Prometheus surface with
`COMPANY_OS_METRICS_ENABLED=true`. Keep `/metrics` on the operations network;
the service refuses this same-port mode under public exposure. See
[`observability.md`](observability.md).

## Reverse proxy and network boundary

Terminate TLS at an enterprise reverse proxy. Publish only Web and API; do not
publish PostgreSQL. Set `COMPANY_OS_PUBLIC_URL`, `COMPANY_OS_WEB_ORIGINS`, OIDC
redirect URI and trusted proxy CIDRs to exact values. Wildcard origins and
insecure public origins are rejected. Keep the first-admin claim on private
exposure until ownership is established.

## Backup and restore admission

There are two different recovery artifacts:

- an operator database backup covers identities, memberships, events, outbox,
  projections and authentication state;
- the tenant portability export is authenticated, company-scoped and
  digest-checked, but is not a replacement for disaster-recovery backup.

Before an upgrade, take a PostgreSQL custom-format backup with `pg_dump` using
credentials supplied through the operator environment, encrypt it at rest, and
record the application image digests plus migration journal. Validate every
backup by restoring it into a new, isolated database and checking `/ready`,
tenant counts and a digest export. Never test restore by overwriting the live
database.

The maintained restore-drill command and the release-bound operations image
enforce these safety boundaries. The image contains PostgreSQL 16.15 client
tools matching the declared server major; operators do not need to install
`pg_dump` on the host. It
requires an explicit empty target database whose name contains `restore`,
`drill` or `test`; refuses the source database as its target; refuses to
overwrite an existing dump; and never places the database password in the
`pg_dump`/`pg_restore` argument list or result record:

```sh
COMPANY_OS_SOURCE_DATABASE_URL=<operator-secret> \
COMPANY_OS_RESTORE_DATABASE_URL=<empty-drill-database-secret> \
COMPANY_OS_BACKUP_PATH=/absolute/protected/path/company-os.dump \
npm run ops:restore-drill
```

With a released operations image, mount an operator-controlled encrypted
backup directory at `/backup` and inject the same three variables into the
container. Do not pass a production database password as a command argument;
use the deployment secret manager or an ephemeral environment file. The
operations image is digest-addressed in `release-manifest.json`.

The command returns only a stable pass envelope and backup SHA-256 digest. It
does not delete a failed/partial target or the backup; cleanup remains an
explicit operator action.

The self-hosted Compose file also provides an opt-in `backup` profile. It uses
the same release-bound operations image, runs `pg_dump` without a shell, streams
the dump directly through AES-256-GCM, writes ciphertext plus a small
authentication manifest atomically, and never writes a plaintext dump. The
32-byte base64 encryption key must be injected by the deployment secret manager:

```sh
docker compose --env-file deploy/self-hosted.env \
  --file deploy/compose.self-hosted.yml --profile backup up -d backup
```

`COMPANY_OS_BACKUP_INTERVAL_SECONDS` defaults to 86400 and cannot be configured
below one hour. The service does not automatically delete historical backups;
retention and off-site replication belong to operator-controlled encrypted
storage. The maintained encrypted restore drill authenticates the entire
ciphertext and its critical manifest metadata before streaming a second
decryption pass directly into `pg_restore`; it never creates a plaintext dump:

```sh
COMPANY_OS_RESTORE_DATABASE_URL=<empty-drill-database-secret> \
COMPANY_OS_ENCRYPTED_BACKUP_PATH=/absolute/protected/path/company-os.dump.enc \
COMPANY_OS_BACKUP_ENCRYPTION_KEY=<deployment-secret> \
npm run ops:encrypted-restore-drill
```

The target must be an empty database explicitly named for restore/drill/test.
`npm run test:encrypted-backup:postgres16` runs the complete disposable
PostgreSQL 16 dump → encrypt → authenticate → direct-stream restore admission
and verifies the retained event plus absence of plaintext artifacts.

## Upgrade and rollback

1. Pin both image references to immutable digests; do not follow `latest`.
2. Read release notes and migration compatibility, then take and rehearse a
   backup.
3. Run the new migration image against a disposable restored copy and execute
   the full admission suite.
4. Stop new work dispatch, allow or explicitly cancel in-flight Attempts, then
   run the production migration job once.
5. Replace API, verify `/ready`, replace Web, and run the organization → work →
   approval → evidence smoke path.

For a real N → N+1 release, first generate and retain both manifests, then
create the deterministic cutover plan:

```sh
npm run release:cutover-plan -- previous-release.json current-release.json
```

The command rejects a relabelled API image, rewritten migration history,
PostgreSQL-major drift and unproven public-contract changes. Its output is a
plan with required evidence IDs and always says `PLANNED_NOT_EXECUTED`; it does
not claim that the operator has frozen dispatch, taken a backup, moved ingress
or completed the observation window. See ADR 0025.

Application rollback to an older image is allowed only when that release is
declared compatible with the migrated schema. Otherwise keep the new binary and
restore the paired database backup into a parallel target before a controlled
cutover. Database restoration is destructive and always requires an explicit
operator incident decision; no automatic down-migration is provided.

## Current admission evidence

On 2026-08-26 both Dockerfiles built successfully with Node
`22.12.0-bookworm-slim`, Compose configuration resolved successfully, production
build and TypeScript checks passed, and focused deployment/runtime-config tests
passed. Both containers were started as UID 1000; the Web returned its injected
formal configuration and the API returned structured liveness. The full test
gate also passed 468 cases (464 passed and four explicitly environment-gated
live cases skipped in the credential-free run) plus 19 Chromium cases (15
passed and four live-infrastructure gates skipped by default). The reference OIDC live
gate passed separately with no route interception. A second compatibility gate
passed against real, digest-pinned
Keycloak 26.7.2 plus PostgreSQL and the production Web build. The isolated
PostgreSQL 16 operations-image admission also completed a real dump, restore,
schema validation and retained-event comparison, then removed every temporary
container, network and volume. Finally, `npm run test:compose:self-hosted`
passed the release-shaped topology with separate TLS Web/API origins, runtime
Web configuration, real Keycloak authorization-code + S256 PKCE, first-admin
claim, company and organization creation, refresh persistence and readiness
without browser route interception. The opt-in scheduled encrypted-backup
contract and its real PostgreSQL 16 ciphertext-only restore admission passed;
off-site retention rehearsal and production IdP/TLS acceptance remain external
release evidence rather than implied capabilities.
The PostgreSQL upgrade admission also passed the frozen `0004_human_invites`
to `0005_durable_control_plane` boundary: the current API image retained the
N-1 company/event contract after migration, and the pre-upgrade backup restored
to a separate `company_os_upgrade_rollback` database with its four-entry
migration journal and marker event intact.
The supported database policy is documented in
`docs/postgresql-support-policy.md`. Run
`npm run test:upgrade:postgres-major` before a 16→17 cutover; it proves a
logical dump/restore into an empty 17 target while preserving the untouched 16
source as the rollback boundary. It never performs an in-place major upgrade.
