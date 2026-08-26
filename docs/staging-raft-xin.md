# Isolated raft.xin staging profile

This profile is the non-production customer acceptance environment for Company
OS. It is not allowed to reuse or join any Raft/Buzz production container,
network, volume, database, bucket, queue, or H3 runtime.

## Fixed coordinates

- Web: `https://company-os.raft.xin` -> `127.0.0.1:4600`
- API: `https://company-os-api.raft.xin` -> `127.0.0.1:4601`
- deployment root: `/srv/company-os/staging`
- Compose project/network: `company-os-staging` / `company-os-staging_internal`
- host budget: at most 1 CPU, 1.25 GiB memory, 8 GiB disk and 256 steady-state PIDs

The API and Web are the only long-running Company OS containers on
`raft-generator`. PostgreSQL 16, enterprise OIDC, Vault Broker, Agent Node and
Data Node must be externally hosted staging dependencies. `raft-h3` is outside
the deployment boundary.

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

The following external prerequisites do not yet exist for Company OS:

- an independent PostgreSQL 16 coordinate;
- an enterprise OIDC client/issuer;
- a HashiCorp Vault coordinate and least-privilege AppRole;
- a Data Node and Agent Node coordinate;
- a Company OS-owned private ZOS bucket and bucket-scoped identity;
- DNS, Nginx sites and certificates for both fixed hostnames.

The ZOS Hangzhou 7 endpoints are known, but no bucket is allocated. Existing
`generator001y`, `workflow001y` and `raft-client-upload-20260601` buckets are
not Company OS staging resources and must not be reused. This preflight is
inventory evidence only; it is not staging acceptance.

## Secret files

An operator or Vault Agent renders the following files under
`/etc/company-os/secrets` with directory mode `0700` and file mode `0400` or
`0600`. Values never enter Compose YAML, image layers, Git, chat, or command
arguments:

- `migration-database-url`
- `runtime-database-url`
- `runtime-database-password`
- `oidc-client-secret`
- `session-signing-key`
- `agent-node-bearer-token`
- `data-node-bearer-token`
- `secret-broker-bearer-token`

`NAME` and `NAME_FILE` are mutually exclusive and ambiguous configuration
fails closed. Vault is accessed only through the customer-owned Secret Broker;
the Company OS control plane never receives provider credentials or Vault root
tokens.

## Object storage

The existing ZOS bucket `generator001y` is forbidden. Create a separate private
bucket for encrypted Company OS backups, enable versioning, use a bucket-scoped
IAM principal, and decide object lock before bucket creation because compliance
retention cannot be disabled later. The storage endpoint is configured only in
the backup uploader, not in the API or Web containers.

## Deployment gate

Before any start:

1. create and verify a release handoff with
   `npm run release:staging-bundle -- <release-manifest.json> <empty-output-directory>`;
   transfer only that allowlisted, digest-bound directory. The target does not
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
     node scripts/install-staging-release-bundle.mjs \
     --bundle /handoff --root /srv/company-os/staging

   docker run --rm --network none --read-only --cap-drop ALL \
     --security-opt no-new-privileges:true --user 0:0 \
     --mount type=bind,src=/absolute/received-bundle,dst=/handoff,readonly \
     --mount type=bind,src=/srv/company-os/staging,dst=/srv/company-os/staging \
     "$COMPANY_OS_VERIFIED_OPS_IMAGE" \
     node scripts/install-staging-release-bundle.mjs \
     --bundle /handoff --root /srv/company-os/staging --apply
   ```

   The first command does not write. The second writes the verified payload to
   `releases/<version>-<source-sha-prefix>` through a same-filesystem partial
   directory and rename, records `PREPARED_NOT_STARTED`, and preserves every
   earlier immutable release. It does not pull images, read Secrets, migrate the
   database, start services or move traffic;
2. copy only the public `staging.env`, create a private regular file named
   `/srv/company-os/staging/staging-dependencies.json` from
   `deploy/staging-dependencies.example.json`, and separately inject the
   required Secret files. Every placeholder in the dependency file must be
   replaced with an independently owned resource, accountable owner reference
   and retained evidence reference. The template itself is intentionally
   rejected.

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
3. publish immutable API/Web image digests and verify SBOM/provenance;
4. create external PostgreSQL 16, OIDC, Vault Broker, Agent Node and Data Node;
5. create the isolated ZOS bucket and restricted IAM principal;
6. add new Nginx site files without modifying existing site files;
7. issue new certificates through Certbot without copying private keys;
8. capture pre-deployment container, network, port and disk inventory;
9. bind the exact prepared release ID and an approved, non-secret change-record
   reference, render the non-mutating startup plan, then explicitly apply it:

   ```sh
   docker run --rm --network host --read-only --cap-drop ALL \
     --security-opt no-new-privileges:true --user 0:0 \
     --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
     --mount type=bind,src=/srv/company-os/staging,dst=/srv/company-os/staging \
     --mount type=bind,src=/etc/company-os/secrets,dst=/etc/company-os/secrets,readonly \
     "$COMPANY_OS_VERIFIED_OPS_IMAGE" \
     node --experimental-strip-types scripts/start-staging-release.mjs \
     --root /srv/company-os/staging \
     --dependency-manifest /srv/company-os/staging/staging-dependencies.json \
     --release 0.1.0-rc.1-REPLACE_WITH_SOURCE_PREFIX \
     --authorization change:REPLACE_WITH_APPROVED_STAGING_RECORD \
     --secret-directory /etc/company-os/secrets \
     --public-env-file /srv/company-os/staging/staging.env

   docker run --rm --network host --read-only --cap-drop ALL \
     --security-opt no-new-privileges:true --user 0:0 \
     --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
     --mount type=bind,src=/srv/company-os/staging,dst=/srv/company-os/staging \
     --mount type=bind,src=/etc/company-os/secrets,dst=/etc/company-os/secrets,readonly \
     "$COMPANY_OS_VERIFIED_OPS_IMAGE" \
     node --experimental-strip-types scripts/start-staging-release.mjs \
     --root /srv/company-os/staging \
     --dependency-manifest /srv/company-os/staging/staging-dependencies.json \
     --release 0.1.0-rc.1-REPLACE_WITH_SOURCE_PREFIX \
     --authorization change:REPLACE_WITH_APPROVED_STAGING_RECORD \
     --secret-directory /etc/company-os/secrets \
     --public-env-file /srv/company-os/staging/staging.env \
     --apply
   ```

   The first command only validates the prepared release, exact API/Web/Ops
   image coordinates, dependency-manifest digest and proposed ordered actions.
   `--apply` revalidates the dependency file before any Docker mutation,
   acquires a
   single-writer lock, runs the doctor again, validates Compose, pulls the exact
   images, runs migration and runtime-role provisioning, starts API, waits for
   readiness, starts Web, and performs Web/API smoke probes. Success is recorded
   as `STARTED_NOT_ACCEPTED`, never as customer acceptance. Failure is recorded
   as `START_FAILED_REQUIRES_REVIEW`; after migration begins the tool does not
   attempt a down migration, delete the candidate or silently retry. An
   operator must review and use the parallel-database rollback contract;
10. retain `startup-state.json`, doctor output, immutable image attestations and
    externally verified customer-acceptance evidence. Do not move ingress or
    claim production readiness from the startup record alone.

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
second revision-checked maintenance command with `mode: "OPEN"`. Reopening is
never automatic: a failed or ambiguous restart remains frozen for review. See
[ADR 0039](adr/0039-persistent-instance-dispatch-freeze.md).

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
