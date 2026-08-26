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
   transfer only that allowlisted, digest-bound directory. On the target, first
   render the mutation-free install plan, then explicitly apply it:

   ```sh
   npm run release:staging-install -- --bundle /absolute/received-bundle --root /srv/company-os/staging
   npm run release:staging-install -- --bundle /absolute/received-bundle --root /srv/company-os/staging --apply
   ```

   The first command does not write. The second writes the verified payload to
   `releases/<version>-<source-sha-prefix>` through a same-filesystem partial
   directory and rename, records `PREPARED_NOT_STARTED`, and preserves every
   earlier immutable release. It does not pull images, read Secrets, migrate the
   database, start services or move traffic;
2. copy only the public `staging.env` and separately inject the required Secret
   files; run `npm run ops:doctor:staging` and retain its `READY` result;
3. publish immutable API/Web image digests and verify SBOM/provenance;
4. create external PostgreSQL 16, OIDC, Vault Broker, Agent Node and Data Node;
5. create the isolated ZOS bucket and restricted IAM principal;
6. add new Nginx site files without modifying existing site files;
7. issue new certificates through Certbot without copying private keys;
8. run `docker compose --env-file deploy/staging.env -f deploy/compose.staging.yml config`;
9. capture pre-deployment container, network, port and disk inventory;
10. run migrations and runtime-role provisioning before starting API/Web.

The doctor is deliberately first-install-only and read-only. It refuses an
existing `company-os-staging` project/network, mutable image tags, unsafe Secret
metadata, unavailable host probes, and missing public HTTPS coordinates. It
does not print Secret contents or repair the host. See
[ADR 0032](adr/0032-read-only-staging-install-doctor.md).

The release handoff contains no OCI layers and no Secret files. Its
`bundle-manifest.json` binds the exact source revision, five release image
digests and every included file. Missing, changed, duplicate, symlinked or
undeclared handoff files fail verification; an existing output directory is
never overwritten. Reinstalling the identical retained payload is idempotent,
while a changed retained payload fails closed.

Rollback uses the previous immutable image digests and a parallel restored
database. It never runs a destructive down migration against the active data.
