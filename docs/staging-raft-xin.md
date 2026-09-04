# Isolated raft.xin staging profile

This profile is the non-production customer acceptance environment for Company
OS. It is not allowed to reuse or join any Raft/Buzz production container,
network, volume, database, bucket, queue, or H3 runtime.

## Fixed coordinates

- Public Demo: `https://anc.raft.xin` and `https://api.anc.raft.xin`; the
  active immutable Demo release owns a dedicated Compose project and Docker
  network and does not use the formal loopback ports below.
- Private Alpha Web: `https://company-os.raft.xin` -> `127.0.0.1:4600`
- Private Alpha API: `https://company-os-api.raft.xin` -> `127.0.0.1:4601`
- fixture-only reference Data Node ingress -> `127.0.0.1:4322`
- deployment root: `/srv/company-os/staging`
- Compose project/network: `company-os-staging` / `company-os-staging_internal`
- host budget: at most 1 CPU, 1.25 GiB memory, 8 GiB disk and 256 steady-state PIDs

API, Web and the fixture-only reference Data Node are long-running Company OS
containers in this acceptance profile. PostgreSQL 16, enterprise OIDC, Vault
Broker and Agent Node remain separately owned staging dependencies. The
reference Data Node is exposed only through environment-owned verified TLS and
may be replaced with a customer Data Node implementing protocol `1.0`.
`raft-h3` is outside the deployment boundary.

## Infrastructure preflight and isolated host preparation — 2026-08-26

No product deployment was performed. The authorized inspection found ports
4600/4601 available and no prior `/srv/company-os`, `/opt/company-os` or
`/etc/company-os` state. A later explicitly authorized host-preparation step
created only two empty, root-owned isolation directories:

- `/srv/company-os/staging`, mode `0750`;
- `/etc/company-os/secrets`, mode `0700`.

No Secret file, public environment, container, network, image, DNS record,
certificate or proxy configuration was created. Existing Buzz production
containers, networks, volumes and PostgreSQL 17 remain forbidden and untouched.

The following external prerequisites do not yet exist for the private Alpha:

- an independent PostgreSQL 16 coordinate;
- an enterprise OIDC client/issuer;
- a HashiCorp Vault coordinate and least-privilege AppRole;
- an Agent Node coordinate and verified TLS ingress for either the fixture-only
  reference Data Node or a customer Data Node;
- the final binding and verification of the dedicated ZOS bucket-scoped identity;
- HTTPS certificates for both private Alpha hostnames. Their DNS records and
  HTTP-only Nginx sites exist, but formal OIDC and company capabilities remain
  fail-closed until an explicitly authorized TLS and first-start operation.

The dedicated ZOS Hangzhou 7 bucket has now been created as private,
single-availability-zone storage with ZOS-managed encryption and versioning.
Object Lock is disabled and no automatic lifecycle deletion is configured.
The bucket-scoped policy exists but the persistent IAM identity is not accepted
until its credentials have been saved by the user and the policy binding has
been verified. Existing `generator001y`, `workflow001y` and
`raft-client-upload-20260601` buckets remain forbidden. This is infrastructure
preparation evidence only; it is not backup or staging acceptance.

## Secret files

An operator or Vault Agent renders the following files required for the
initial API/Web/Data Node start under
`/etc/company-os/secrets` with directory mode `0700` and file mode `0400` or
`0600`. Values never enter Compose YAML, image layers, Git, chat, or command
arguments:

- `migration-database-url`
- `runtime-database-url`
- `runtime-database-password`
- `oidc-client-secret`
- `feishu-app-secret` (when `COMPANY_OS_IDENTITY_PROVIDER=FEISHU`; mutually
  exclusive with `oidc-client-secret` for runtime use)
- `session-signing-key`
- `agent-node-bearer-token`
- `data-node-bearer-token`
- `secret-broker-bearer-token`
- `internal-ca-cert.pem` (public CA certificate only; no private key)

The migration, runtime API, runtime-role provisioner, and optional backup
process load this CA with `NODE_EXTRA_CA_CERTS`. PostgreSQL URLs must retain
`sslmode=verify-full`; the server certificate must match the manifest's
`tlsServerName`. Do not replace this with `sslmode=require`.

The opt-in backup profile is a separate readiness gate. Before that profile is
started, render these additional files under the same policy:

- `backup-encryption-key`
- `zos-access-key-id`
- `zos-secret-access-key`

`NAME` and `NAME_FILE` are mutually exclusive and ambiguous configuration
fails closed. Vault is accessed only through the customer-owned Secret Broker;
the Company OS control plane never receives provider credentials or Vault root
tokens.

## Object storage

The existing ZOS bucket `generator001y` is forbidden. Company OS uses a
separate private, versioned bucket and a bucket-scoped IAM principal. The
uploader validates the encrypted ciphertext against its authenticated manifest,
uploads ciphertext first, verifies remote length and digest metadata, and
publishes the completion manifest last. A failed verification never publishes
completion. Credentials are read only from private files; the storage endpoint
is configured only in the backup service, not in API or Web containers.

## Deployment gate

Before any start:

1. create and verify a release handoff with
   `npm run release:staging-bundle -- <release-manifest.json> <empty-output-directory>`;
   create a portable archive with
   `npm run release:staging-archive -- <bundle-directory> <new-archive.tgz>`;
   transfer only that digest-reported archive. The archive command first
   verifies the exact bundle allowlist, disables macOS AppleDouble and extended
   attribute emission, writes an atomic ustar archive, and verifies its entry
   list before returning. Do not use an ad-hoc Finder or default macOS tar
   archive: undeclared `._*` files correctly fail target admission. The target does not
   need the Company OS source tree, npm, or a host Node runtime. Obtain the
   attested Ops image digest from the protected release result—not from the
   unverified received directory—and bind it as
   `COMPANY_OS_VERIFIED_OPS_IMAGE`. On the target, first render the
   mutation-free install plan, then explicitly apply it through that image:

   ```sh
   docker run --rm --network none --read-only --cap-drop ALL \
     --security-opt no-new-privileges:true --user 0:0 \
     --mount type=bind,src=/absolute/received-bundle,dst=/handoff,readonly \
     --mount type=bind,src=/srv/company-os/staging,dst=/srv/company-os/staging \
     "$COMPANY_OS_VERIFIED_OPS_IMAGE" \
     node --experimental-strip-types scripts/install-staging-release-bundle.mjs \
     --bundle /handoff --root /srv/company-os/staging

   docker run --rm --network none --read-only --cap-drop ALL \
     --security-opt no-new-privileges:true --user 0:0 \
     --mount type=bind,src=/absolute/received-bundle,dst=/handoff,readonly \
     --mount type=bind,src=/srv/company-os/staging,dst=/srv/company-os/staging \
     "$COMPANY_OS_VERIFIED_OPS_IMAGE" \
     node --experimental-strip-types scripts/install-staging-release-bundle.mjs \
     --bundle /handoff --root /srv/company-os/staging --apply
   ```

   The first command does not write. The second writes the verified payload to
   `releases/<version>-<source-sha-prefix>` through a same-filesystem partial
   directory and rename, records `PREPARED_NOT_STARTED`, and preserves every
   earlier immutable release. It does not pull images, read Secrets, migrate the
   database, start services or move traffic;
2. prepare the four Secret-free site-contract files outside the release store:
   `site-runtime.json`, the exactly rendered `staging.env`,
   `staging-dependencies.json`, and `dependency-secrets.json`. The OIDC callback
   in `staging.env` must use the API origin, not the Web origin. Every
   placeholder in the dependency and site files must be replaced with an
   independently owned resource, accountable owner reference and retained
   evidence reference. `dependency-secrets.json` contains only filenames,
   owners, consumers, generation methods, rotation classes and modes; it never
   contains values. The templates themselves are intentionally rejected.

   Bind the four files to the exact prepared release through the attested Ops
   image. The first command is read-only. The second writes only a digest-bound
   site contract, an adoption evidence record and the schema-v2 release-store
   binding; it does not create Secret values, initialize dependencies, migrate,
   start containers or move traffic:

   ```sh
   docker run --rm --network none --read-only --cap-drop ALL \
     --security-opt no-new-privileges:true --user 0:0 \
     --mount type=bind,src=/absolute/site-contract-input,dst=/contract,readonly \
     --mount type=bind,src=/srv/company-os/staging,dst=/srv/company-os/staging \
     "$COMPANY_OS_VERIFIED_OPS_IMAGE" \
     node --experimental-strip-types scripts/install-staging-release-bundle.mjs \
     --adopt-site-contract \
     --root /srv/company-os/staging \
     --release REPLACE_WITH_EXACT_RELEASE_ID \
     --site-runtime /contract/site-runtime.json \
     --public-env-file /contract/staging.env \
     --dependency-manifest /contract/staging-dependencies.json \
     --dependency-secret-metadata /contract/dependency-secrets.json \
     --product-secret-directory /etc/company-os/secrets

   docker run --rm --network none --read-only --cap-drop ALL \
     --security-opt no-new-privileges:true --user 0:0 \
     --mount type=bind,src=/absolute/site-contract-input,dst=/contract,readonly \
     --mount type=bind,src=/srv/company-os/staging,dst=/srv/company-os/staging \
     "$COMPANY_OS_VERIFIED_OPS_IMAGE" \
     node --experimental-strip-types scripts/install-staging-release-bundle.mjs \
     --adopt-site-contract \
     --root /srv/company-os/staging \
     --release REPLACE_WITH_EXACT_RELEASE_ID \
     --site-runtime /contract/site-runtime.json \
     --public-env-file /contract/staging.env \
     --dependency-manifest /contract/staging-dependencies.json \
     --dependency-secret-metadata /contract/dependency-secrets.json \
     --product-secret-directory /etc/company-os/secrets \
     --apply
   ```

   Separately inject the required Secret files only after their accountable
   generation/install action has been approved.

   Before the doctor, validate the exact dependency file through the attested
   Ops image and retain its secret-free digest:

   ```sh
   docker run --rm --network none --read-only --cap-drop ALL \
     --security-opt no-new-privileges:true \
     --mount type=bind,src=/srv/company-os/staging,dst=/srv/company-os/staging,readonly \
     "$COMPANY_OS_VERIFIED_OPS_IMAGE" \
     node --experimental-strip-types scripts/validate-staging-dependencies.ts \
     /srv/company-os/staging/staging-dependencies.json
   ```

   The admission rejects weak transport, missing owners/evidence, credentials,
   placeholders and known Buzz/Raft production coordinates. Database and bearer
   coordinates still belong only in protected Secret files. Then run the doctor
   from the same attested Ops image and retain its `READY` result:

   ```sh
   docker run --rm --network host --read-only --cap-drop ALL \
     --security-opt no-new-privileges:true --user 0:0 \
     --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
     --mount type=bind,src=/srv/company-os/staging,dst=/srv/company-os/staging,readonly \
     --mount type=bind,src=/etc/company-os/secrets,dst=/etc/company-os/secrets,readonly \
     "$COMPANY_OS_VERIFIED_OPS_IMAGE" \
     node --experimental-strip-types scripts/staging-deployment-doctor.ts \
     --root /srv/company-os/staging \
     --secret-directory /etc/company-os/secrets \
     --public-env-file /srv/company-os/staging/staging.env
   ```

   The Docker socket grants daemon-level host authority even when mounted with
   a read-only-looking bind option. It is allowed only for this short-lived,
   exact-digest operator container after explicit deployment authorization; it
   is never mounted into the API, Web, Agent Node, Data Node or Secret Broker;
3. publish immutable API/Web/Ops/Agent Node/Vault Broker/reference Data Node
   image digests and verify SBOM/provenance;
4. create external PostgreSQL 16, OIDC, Vault Broker and Agent Node; configure
   verified TLS ingress for the selected Data Node;
5. create the isolated ZOS bucket and restricted IAM principal;
6. add new Nginx site files without modifying existing site files;
7. issue new certificates through Certbot without copying private keys;
8. capture pre-deployment container, network, port and disk inventory;
9. bind the exact prepared release ID and distinct approved, non-secret
   dependency, migration, product-start, and acceptance change records. For a
   release carrying the phased first-start contract, do **not** use the legacy
   aggregate `start-staging-release.mjs` apply path. Dependency bootstrap must
   first produce verified `DEPENDENCIES_READY_NOT_PRODUCT_MIGRATED` evidence.

   Plan the dependency phase first. Planning is read-only:

   ```sh
   docker run --rm --network host --read-only --cap-drop ALL \
     --security-opt no-new-privileges:true --user 0:0 \
     --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
     --mount type=bind,src=/srv/company-os/staging,dst=/srv/company-os/staging \
     --mount type=bind,src=/etc/company-os/dependency-secrets,dst=/etc/company-os/dependency-secrets \
     "$COMPANY_OS_VERIFIED_OPS_IMAGE" \
     node --experimental-strip-types scripts/run-staging-dependency-phase.mjs \
     --root /srv/company-os/staging \
     --release REPLACE_WITH_RELEASE_ID \
     --authorization change:REPLACE_WITH_APPROVED_DEPENDENCY_RECORD
   ```

   Apply only after reviewing that exact plan. The dependency Secret mount is
   writable solely because the one-shot Vault bootstrap must atomically retain
   its recovery record and AppRole outputs; it is never mounted into the
   product API or Web:

   ```sh
   docker run --rm --network host --read-only --cap-drop ALL --cap-add CHOWN \
     --security-opt no-new-privileges:true --user 0:0 \
     --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
     --mount type=bind,src=/srv/company-os/staging,dst=/srv/company-os/staging \
     --mount type=bind,src=/etc/company-os/dependency-secrets,dst=/etc/company-os/dependency-secrets \
     "$COMPANY_OS_VERIFIED_OPS_IMAGE" \
     node --experimental-strip-types scripts/run-staging-dependency-phase.mjs \
     --root /srv/company-os/staging \
     --release REPLACE_WITH_RELEASE_ID \
     --authorization change:REPLACE_WITH_APPROVED_DEPENDENCY_RECORD \
     --apply
   ```

   `CAP_CHOWN` is admitted only for this dependency apply operator. It is
   required to transfer the generated `0400` OIDC configuration and
   consumer-specific Secret projections to the non-root identities resolved
   from the exact runtime images. The read-only plan, every later phase, and
   every long-lived dependency or product container retain `cap-drop ALL`
   without this capability.

   Success means only that the isolated dependencies are healthy and ready for
   migration. A failure is retained as
   `DEPENDENCY_INITIALIZATION_FAILED_REQUIRES_REVIEW`; the executor never
   deletes volumes, retries Vault initialization, or claims rollback.

   Once exact dependency evidence exists, plan and then apply migration with
   only the migration authorization:

   ```sh
   docker run --rm --network host --read-only --cap-drop ALL \
     --security-opt no-new-privileges:true --user 0:0 \
     --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
     --mount type=bind,src=/srv/company-os/staging,dst=/srv/company-os/staging \
     --mount type=bind,src=/etc/company-os/secrets,dst=/etc/company-os/secrets,readonly \
     "$COMPANY_OS_VERIFIED_OPS_IMAGE" \
     node --experimental-strip-types scripts/run-staging-migration-phase.mjs \
     --root /srv/company-os/staging \
     --dependency-manifest /srv/company-os/staging/staging-dependencies.json \
     --release 0.1.0-rc.1-REPLACE_WITH_SOURCE_PREFIX \
     --authorization change:REPLACE_WITH_APPROVED_MIGRATION_RECORD \
     --secret-directory /etc/company-os/secrets \
     --public-env-file /srv/company-os/staging/staging.env

   docker run --rm --network host --read-only --cap-drop ALL \
     --security-opt no-new-privileges:true --user 0:0 \
     --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
     --mount type=bind,src=/srv/company-os/staging,dst=/srv/company-os/staging \
     --mount type=bind,src=/etc/company-os/secrets,dst=/etc/company-os/secrets,readonly \
     "$COMPANY_OS_VERIFIED_OPS_IMAGE" \
     node --experimental-strip-types scripts/run-staging-migration-phase.mjs \
     --root /srv/company-os/staging \
     --dependency-manifest /srv/company-os/staging/staging-dependencies.json \
     --release 0.1.0-rc.1-REPLACE_WITH_SOURCE_PREFIX \
     --authorization change:REPLACE_WITH_APPROVED_MIGRATION_RECORD \
     --secret-directory /etc/company-os/secrets \
     --public-env-file /srv/company-os/staging/staging.env \
     --apply
   ```

   Migration success is `MIGRATION_PROVISION_COMPLETE_NOT_STARTED`; it never
   starts a product service. Then separately plan and apply product start with
   the product-start authorization using
   `scripts/run-staging-product-start-phase.mjs` and the same path arguments.
   Product-start success is `STARTED_NOT_ACCEPTED`, never customer acceptance.
   Either failure is retained for review; after a mutation may have begun, the
   tools do not delete volumes, attempt a down migration, silently retry, or
   claim automatic rollback. An
   operator must review and use the parallel-database rollback contract;

   After externally owned staging evidence has been assembled and structurally
   validated, bind its coordinate-free record with the acceptance authorization
   using `scripts/run-staging-acceptance-phase.mjs --record <absolute-path>`.
   Run once without `--apply`, then repeat with `--apply`. This writes only
   `ACCEPTANCE_RECORD_BOUND_PENDING_EXTERNAL_VERIFICATION`; it deliberately
   leaves `acceptanceClaimed=false` until the real OIDC, model, data, Secret,
   restart, and human-owner evidence is independently verified;
   Before a later immutable release upgrade, run
   `npm run release:staging-upgrade-plan -- --inspect-bindings --root <site-root>`.
   This read-only command derives the active release from private startup state
   and the candidate from the canonical prepared record. After an accountable
   operator supplies a private ADR-0044 authorization file, run the same command
   with `--authorization-file <absolute-path> --authorization <preparation-ref>`.
   A successful result remains `PLANNED_NOT_APPLIED`; it does not freeze
   dispatch, migrate, start candidate services, route traffic, or roll back;
10. retain `startup-state.json`, doctor output, immutable image attestations and
    externally verified customer-acceptance evidence. Do not move ingress or
    claim production readiness from the startup record alone.

For a later N → N+1 traffic phase, deploy the immutable
`deploy/compose.staging-ingress-router.yml` as a separate Compose project and
keep the host reverse proxy on its two stable loopback ports. The private route
contract binds its image, project, network, ports, resource ceiling, and bounded
observation policy. After preparation has completed and separate traffic
authority has been issued, the release-bound Ops image runs:

```sh
npm run release:staging-upgrade-traffic -- --apply \
  --root /srv/company-os/staging \
  --candidate-directory /srv/company-os/staging/upgrade-runtime/candidates/REPLACE_OPERATION \
  --route-directory /srv/company-os/staging/ingress-route \
  --authorization-file /run/company-os/upgrade-authorization.json \
  --authorization change:REPLACE_TRAFFIC_AUTHORITY \
  --runtime-contract /run/company-os/upgrade-runtime.json \
  --route-contract /run/company-os/ingress-route.json
```

The command validates the hardened router container, installs one immutable
route generation, switches the relative `current` symlink, verifies the exact
candidate release on stable Web and API entry points, observes the declared
latency/failure bounds, rechecks responsibility control totals, and only then
records the candidate as active pending acceptance. It never automatically
rolls back.

After successful observation, bind—but do not self-approve—the external
customer acceptance record using the candidate site's separate acceptance
authority:

```sh
npm run release:staging-upgrade-acceptance-handoff -- --apply \
  --root /srv/company-os/staging \
  --operation upgrade-rc4-to-rc5 \
  --authorization change:REPLACE_CUSTOMER_ACCEPTANCE_AUTHORITY \
  --record /run/company-os/customer-acceptance-record.json
```

This command leaves `acceptanceClaimed=false` and `dispatchReopened=false`.
Traffic health is not customer acceptance.

After preparation or any start attempt, inspect the retained state and actual
Docker runtime through the same exact Ops image:

```sh
docker run --rm --network host --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true --user 0:0 \
  --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
  --mount type=bind,src=/srv/company-os/staging,dst=/srv/company-os/staging,readonly \
  "$COMPANY_OS_VERIFIED_OPS_IMAGE" \
  node --experimental-strip-types scripts/inspect-staging-runtime.mjs \
  --root /srv/company-os/staging
```

The inspector is logically read-only. It reads only the release/start records,
the API/Web container service label, configured image reference, process state
and health status, then probes the loopback Web and API readiness endpoints. It
does not inspect container environment variables or mount the Secret directory.
`RUNNING_NOT_ACCEPTED` proves only exact runtime alignment and health. Image
drift, duplicate/missing containers, incomplete/failed start state or failed
probes return a stable review-required status. A changed or missing dependency
manifest is also rejected against the startup-bound digest. The Docker socket remains
daemon-level authority despite the command's read-only behavior.
When a newer bundle has been installed but not cut over, `release` continues to
describe the startup-bound active version and `candidate` reports the staged
version separately. Staging a candidate therefore neither creates image drift
nor prevents an authorized restart of the active release. See
[ADR 0038](adr/0038-active-and-candidate-release-coordinates.md).
The dependency ownership and drift contract is recorded in
[ADR 0040](adr/0040-evidence-bound-staging-dependencies.md).

The doctor is deliberately first-install-only and logically read-only. It refuses an
existing `company-os-staging` project/network, mutable image tags, unsafe Secret
metadata, unavailable host probes, and missing public HTTPS coordinates. It
does not issue a Docker mutation, print Secret contents or repair the host. Its
container nevertheless receives a high-authority Docker socket, so image digest
verification and short lifetime are part of the trust boundary. See
[ADR 0032](adr/0032-read-only-staging-install-doctor.md).

The authorized start container has the same daemon-level socket authority as
the doctor and additionally has write access only to the exact staging root so
it can retain its lock and state record. This authority belongs to the
short-lived operator lifecycle and never crosses into a product service. See
[ADR 0034](adr/0034-authorized-staging-start-lifecycle.md).
Runtime reconciliation and the reason it remains separate from acceptance are
recorded in [ADR 0035](adr/0035-read-only-staging-runtime-status.md).

Before any planned restart or upgrade, a formally authenticated instance
administrator must first read `GET /api/v1/instance/maintenance` and issue an
origin-checked `PATCH /api/v1/instance/maintenance` with the current revision,
`mode: "DISPATCH_FROZEN"`, an operation ID and an approved external change
reference. Do this through the authenticated Company OS admin session; never
place a session cookie, OIDC material or Secret in a shell history or retained
operation record.

The freeze rejects new accountable-work dispatch but deliberately allows
already admitted work, Connector publications and lease revocation to finish.
After those boundaries settle, capture the database-backed drain state using
the runtime database role:

```sh
docker run --rm --network host --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --mount type=bind,src=/etc/company-os/secrets,dst=/run/company-os/secrets,readonly \
  --env COMPANY_OS_DATABASE_URL_FILE=/run/company-os/secrets/runtime-database-url \
  "$COMPANY_OS_VERIFIED_OPS_IMAGE" \
  node --experimental-strip-types scripts/inspect-deployment-drain.ts
```

Only `DRAINED` with `restartAllowed: true` admits the next maintenance phase.
An `OPEN` dispatch window produces `DISPATCH_NOT_FROZEN` even when no work is
currently active, closing the check-to-restart race.
`NOT_DRAINED` identifies aggregate blockers without exposing tenant or Work
records. Retain the output in the protected release store for post-restart
digest comparison; do not treat the record as customer acceptance. See
[ADR 0036](adr/0036-durable-deployment-drain-evidence.md).

After the exact API/Web runtime is healthy again, compare the protected
pre-restart record with a fresh authoritative capture:

```sh
docker run --rm --network host --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --mount type=bind,src=/etc/company-os/secrets,dst=/run/company-os/secrets,readonly \
  --mount type=bind,src=/srv/company-os/staging,dst=/srv/company-os/staging,readonly \
  --env COMPANY_OS_DATABASE_URL_FILE=/run/company-os/secrets/runtime-database-url \
  "$COMPANY_OS_VERIFIED_OPS_IMAGE" \
  node --experimental-strip-types scripts/verify-deployment-state-adoption.ts \
  --before /srv/company-os/staging/pre-restart-drain.json
```

`ADOPTION_VERIFIED` means the exact drained durable source state is unchanged.
Any new blocker, digest drift, malformed/redirected record, or non-private
record mode fails closed and requires operator review.

After adoption and operator review, the same instance administrator issues a
revision-checked `ACCEPTANCE_ONLY` command bound to the exact acceptance plan
and Work allowlist. After independent acceptance confirmation, a separate
revision-checked command with a new authorization reference may set `mode: "OPEN"`. Reopening is
never automatic: a failed or ambiguous restart remains frozen for review. See
[ADR 0039](adr/0039-persistent-instance-dispatch-freeze.md) and
[ADR 0045](adr/0045-bounded-acceptance-only-dispatch.md).

Use the same three actions for a first start or an upgrade. The scope file is a
private, secret-free JSON record that binds `operationId`, `planId`, the exact
SHA-256 acceptance-plan digest, the site's acceptance authorization reference,
and one to 32 `{ companyId, workId }` pairs. Create those Work IDs before the
window is opened; unrelated Work remains blocked.

```sh
npm run release:staging-acceptance-maintenance -- \
  --action open --apply \
  --root /srv/company-os/staging \
  --evidence /srv/company-os/staging/acceptance-maintenance/upgrade-rc4-to-rc5 \
  --origin http://127.0.0.1:4601 \
  --session /run/company-os/operator/instance-admin-cookie \
  --scope /run/company-os/operator/acceptance-scope.json
```

After the allowlisted Work has produced the externally owned evidence, bind
the structurally validated acceptance-handoff state to a separate independent
decision. The decision file must say `ACCEPTED` or `REJECTED`, bind the same
operation/plan/record digests, use a new authorization reference, and assert
`secretMaterialIncluded: false`.

```sh
npm run release:staging-acceptance-maintenance -- \
  --action bind-decision --apply \
  --root /srv/company-os/staging \
  --evidence /srv/company-os/staging/acceptance-maintenance/upgrade-rc4-to-rc5 \
  --scope /run/company-os/operator/acceptance-scope.json \
  --handoff /srv/company-os/staging/upgrade-acceptance-handoff-state.json \
  --decision /run/company-os/operator/independent-acceptance-decision.json
```

Binding the decision does not call the API and leaves dispatch closed. A final
operator action uses a third authorization reference. `ACCEPTED` transitions
to `OPEN`; `REJECTED` returns to `DISPATCH_FROZEN`.

```sh
npm run release:staging-acceptance-maintenance -- \
  --action complete --apply \
  --root /srv/company-os/staging \
  --evidence /srv/company-os/staging/acceptance-maintenance/upgrade-rc4-to-rc5 \
  --origin http://127.0.0.1:4601 \
  --session /run/company-os/operator/instance-admin-cookie \
  --authorization dispatch:reopen-approved-rc5
```

Omit `--apply` to confirm the selected action without mutation. Never pass the
session cookie value on the command line; only its `0600` file path is accepted.

The supported restart path performs these checks as one authorized lifecycle.
Run it without `--apply` first to inspect the exact plan, then repeat with
`--apply` using the same release, operation and authorization references:

```sh
docker run --rm --network host --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true --user 0:0 \
  --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
  --mount type=bind,src=/srv/company-os/staging,dst=/srv/company-os/staging \
  --mount type=bind,src=/etc/company-os/secrets,dst=/etc/company-os/secrets,readonly \
  --env COMPANY_OS_DATABASE_URL_FILE=/etc/company-os/secrets/runtime-database-url \
  "$COMPANY_OS_VERIFIED_OPS_IMAGE" \
  node --experimental-strip-types scripts/restart-staging-release.mjs \
  --root /srv/company-os/staging \
  --public-env-file /srv/company-os/staging/staging.env \
  --secret-directory /etc/company-os/secrets \
  --release 0.1.0-rc.1-REPLACE_WITH_12_HEX \
  --operation restart-staging-20260826-01 \
  --authorization change:REPLACE_WITH_APPROVED_CHANGE
```

The apply invocation adds `--apply`. It never runs migrations, pulls images,
restarts Connector/Data/Vault nodes, or performs an automatic rollback. It
retains operation-specific evidence under `restart-records/`; reuse of an
operation ID fails closed. See [ADR 0037](adr/0037-authorized-staging-restart-state-machine.md).

The release handoff contains no OCI layers and no Secret files. Its
`bundle-manifest.json` binds the exact source revision, five release image
digests and every included file. Missing, changed, duplicate, symlinked or
undeclared handoff files fail verification; an existing output directory is
never overwritten. Reinstalling the identical retained payload is idempotent,
while a changed retained payload fails closed.

Rollback uses the previous immutable image digests and a parallel restored
database. It never runs a destructive down migration against the active data.
