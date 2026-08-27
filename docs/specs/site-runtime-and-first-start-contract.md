# Spec: site runtime and first-start contract

Status: **APPROVED — assumptions 1–5 confirmed by the product owner on
2026-08-27; implementation proceeds test-first**.

## Assumptions to review

1. Hong Kong active and Hangzhou 7 standby are complete, independent Company
   OS staging sites. A site never points its database, OIDC client, Vault,
   Broker, Agent Node, data volume, or runtime network at the other site.
2. The first acceptance environment may run a resource-bounded reference
   dependency stack on the same ordinary cloud server as the product stack.
   The dependency stack remains a separate trust and lifecycle boundary; this
   reference topology does not make PostgreSQL, OIDC, Vault, Connector nodes,
   or model Providers part of Company OS Core/Application.
3. Hangzhou remains private before ICP/public-ingress authorization. It uses
   site-owned internal HTTPS coordinates and a site-owned OIDC callback; it
   never reuses `company-os.raft.xin` or the Hong Kong OIDC client.
4. Off-site ZOS backup remains disabled until separately authorized. First
   start may prove local encrypted backup/restore, but cannot claim off-site
   recovery acceptance while the backup capability is disabled.
5. RC4 stays immutable. These changes qualify a later release; they do not
   mutate `v0.1.0-rc.4` or treat post-release source as an RC4 image.

## Objective

Create one versioned, Secret-free site contract and one executable reference
dependency topology that make first start reproducible on both target sites.
The contract must replace hard-coded Hong Kong coordinates, preserve external
trust boundaries, bind the canonical release store, make optional capabilities
explicit, and stop before any mutation when site, release, dependency, Secret,
resource, or authorization evidence is incomplete.

The operator should be able to answer, from retained evidence:

- which site and role are being started;
- which immutable product and dependency images are admitted;
- which identities, networks, volumes, ports, owners, and evidence references
  belong to that site;
- which capabilities are enabled, disabled, or not yet accepted;
- which exact authorization permits each mutating phase; and
- which state must be retained for review or rollback after a failure.

## Non-goals

- Public DNS, Nginx, public TLS, security-group changes, or ICP cutover.
- ZOS credentials or off-site backup acceptance.
- Real Provider, enterprise data, or customer production credentials.
- Automatic database down-migration, destructive cleanup, or cross-site
  database/identity sharing.
- Moving deployment types or vendor SDKs into `core`, `ports`, or
  `application`.

## Contract shape

### Site manifest

Add a strict, versioned `site-runtime.json` with exact-key validation. It is
public configuration and must reject credentials, placeholders, unknown keys,
Raft/Buzz production coordinates, and ambiguous defaults.

Required sections:

- `site`: stable site ID, `ACTIVE` or `STANDBY`, region, deployment root,
  Compose project, product/dependency networks, loopback ports, and resource
  ceiling;
- `product`: API/Web origins, OIDC callback, stable instance ID, immutable
  release ID, connector/data/broker IDs, and exposure mode;
- `dependencies`: exact immutable images, ownership/evidence references,
  internal HTTPS coordinates, health endpoints, network and volume names for
  PostgreSQL 16, OIDC, Vault, Broker, Agent Node, Reference Data Node, and the
  Provider registry/registration record;
- `capabilities`: explicit `ENABLED`, `DISABLED_PENDING_AUTHORIZATION`, or
  `EXTERNAL` state for public ingress, off-site backup, model inference, and
  enterprise data;
- `authorization`: separate references for dependency initialization,
  migration/provision, product start, and acceptance. A reference records
  authority; it never contains a Secret.

The site manifest is the single source for Compose rendering, dependency
validation, doctor expectations, start planning, and retained evidence.
No code path may import a hard-coded `raftXinStagingExpectation`.

### Secret contract

The eight product startup files remain:

1. `migration-database-url`
2. `runtime-database-url`
3. `runtime-database-password`
4. `oidc-client-secret`
5. `session-signing-key`
6. `agent-node-bearer-token`
7. `data-node-bearer-token`
8. `secret-broker-bearer-token`

Add a separate dependency-secret manifest containing filenames, owner,
consumer, generation method, rotation class, and required mode, but never the
value. PostgreSQL bootstrap, OIDC bootstrap, Vault initialization/AppRole,
Broker-to-Vault, Agent-to-Provider, and internal TLS material must have explicit
entries before dependency initialization can be planned.

The target-owned source Secret directory is `0700`; source files are regular,
single-link, non-empty, bounded, and `0400` or `0600`. It is never mounted into
a runtime container. Authorized initialization creates a separate minimal
projection directory for PostgreSQL, Vault, Vault Secret Broker, Codex Agent
Node, and the TLS gateway. Each projection contains only that immutable
image's required files and resolves ownership from the image's declared user;
OIDC and Vault bootstrap-only inputs are consumed by their initializer and are
not mounted into unrelated runtimes. Values never appear in Compose
interpolation, command arguments, logs, retained JSON, startup state, or
evidence.

### Reference dependency topology

Provide a staging-only Compose definition with pinned immutable images and
bounded resources for:

- dedicated PostgreSQL 16;
- dedicated OIDC provider and product-scoped client bootstrap;
- dedicated Vault plus Vault Secret Broker;
- dedicated Codex Agent Node and Provider registration boundary;
- internal TLS termination or native verified TLS for every HTTP dependency.

The reference OIDC topology is explicitly typed `DEX`; a generic immutable
image is not accepted behind a Dex-specific command or configuration shape.
Other enterprise OIDC implementations remain valid adapters but require their
own explicit runtime renderer rather than silently reusing the Dex contract.

The product Compose remains separate. It consumes only verified HTTPS/file
contracts and joins no existing Raft/Buzz/Generator/H3 network or volume.
Reference Data Node remains fixture-only and must stay labelled as such.

The combined steady-state resource plan must leave at least 512 MiB host memory
headroom above the declared hard limits and at least 2 GiB actually available
before start. Otherwise doctor returns `NOT_READY`.

### Site-neutral product Compose

Replace the hard-coded public origins, callback, instance ID, project/network,
ports, and node IDs in `compose.staging.yml` with required public variables
rendered from the site manifest. Volume and network names must be site-scoped.
The Hangzhou render must contain no Hong Kong hostnames. The Hong Kong render
must contain no Hangzhou coordinates.

Backup is a profile and is excluded from base doctor/start requirements when
`offSiteBackup` is `DISABLED_PENDING_AUTHORIZATION`. Its absence must be
reported as `NOT_ACCEPTED`, not silently treated as complete.

### Canonical release store

One installer must create and verify:

- `.company-os-release-store`;
- `release-store.json` with `PREPARED_NOT_STARTED` and exact release path;
- the immutable release directory and bundle manifest;
- the site manifest, public environment, dependency manifest, and their
  digests; and
- an append-only installation evidence record.

The start planner accepts only this canonical state. Candidate directories
that are not adopted into the store remain inspectable but are not startable.
Adoption is idempotent and refuses any digest mismatch; it never deletes RC3.

## First-start state machine

The planner produces these separately authorized phases:

1. `VALIDATE_SITE_CONTRACT`
2. `VALIDATE_DEPENDENCY_SECRET_METADATA`
3. `INITIALIZE_DEPENDENCIES`
4. `VERIFY_DEPENDENCY_TLS_AND_HEALTH`
5. `DOCTOR_PRODUCT`
6. `MIGRATE_DATABASE`
7. `PROVISION_RUNTIME_ROLE`
8. `START_REFERENCE_DATA_NODE`
9. `START_API`
10. `START_WEB`
11. `RUN_ACCEPTANCE`

Planning is always non-mutating. Applying a phase requires its matching
authorization reference. A failed dependency phase stops before migration. A
failure at or after migration records `databaseMigrationMayHaveRun` and
requires review; it does not automatically delete volumes, roll back schema,
or reuse the prior binary on the current database.

The maximum successful state before acceptance is
`STARTED_NOT_ACCEPTED`. Only the full acceptance matrix may produce
`STAGING_ACCEPTED`, and disabled capabilities remain visible exclusions.

## Acceptance matrix

- two real OIDC users prove tenant membership and negative authorization;
- organization, accountable human, Agent, goal, task, run, budget, approval,
  evidence, responsibility, Secret reference, and data authorization survive
  API/Web restart;
- an admitted Agent Node proves idempotent dispatch, progress, pause/resume,
  cancel, timeout, outcome-unknown reconciliation, evidence, and result;
- exact high-risk action/digest/work/contract/Agent/human/evidence/result
  binding is rejected when any component differs;
- data egress is default-deny and only the revision-bound fixture grant passes;
- Provider credentials remain at Agent Node/Broker boundaries and raw prompts,
  outputs, sessions, and private reasoning do not enter the control plane;
- desktop/mobile Web exercises onboarding, organization, humans, Agents,
  goals, tasks, runs, approvals, governance, settings, and recovery without
  request interception;
- dependency and product restarts preserve durable state and produce bounded
  logs/metrics without Secret material;
- encrypted local backup/restore is proven; off-site recovery remains visibly
  `NOT_ACCEPTED` until its separate authorization and credentials exist.

## Tech stack and project structure

- TypeScript strict ESM for parsers, planners, doctor, installer, and tests.
- Docker Compose for the staging reference topology.
- Existing PostgreSQL, Keycloak/Dex compatibility, Vault, Connector, and
  browser admission harnesses are reused rather than replaced.
- New source stays under `adapters/config`, `scripts`, `deploy`, `tests`,
  `tests/e2e`, and `docs`; inward product layers remain unchanged.

## Commands

```sh
npm install
node --test --experimental-strip-types tests/site-runtime-contract.test.ts
node --test --experimental-strip-types tests/staging-dependency-compose.test.ts
node --test --experimental-strip-types tests/staging-release-install.test.ts tests/staging-release-start.test.ts
npm run check:boundaries
npm run typecheck
npm run build
npm run verify
```

## Testing strategy

- Small: exact-key site/Secret metadata parsing, site isolation, optional
  capability states, resource arithmetic, placeholder/Secret rejection.
- Medium: render both sites, validate Compose, adopt a bundle into a temporary
  canonical store, and prove authorization-separated plans.
- Large: disposable real PostgreSQL/OIDC/Vault/Broker/Agent/Data services,
  restart/recovery, and the browser acceptance matrix. External/customer tests
  remain explicit skips until coordinates are supplied.

TDD is mandatory for every behavioral change: first demonstrate current
hard-coding, backup coupling, or unsafe acceptance with a failing test; then
make the minimal implementation pass and run the complete gate.

## Boundaries

- Always: immutable image digests, exact parsers, site-scoped ownership,
  Secret-file injection, least privilege, retained evidence, explicit fixture
  labels, and failure states that do not claim acceptance.
- Ask first: generating any real Secret, initializing a database/IdP/Vault,
  creating runtime objects on a target, migration, first start, backup target,
  public ingress, DNS/TLS/security group, or identity/responsibility semantics.
- Never: credentials in git/chat/env/arguments/logs; cross-site shared state;
  reuse of Raft/Buzz/Generator/H3 data or networks; automatic destructive
  rollback; mutable image tags; or treating Demo/fixture nodes as enterprise
  evidence.

## Implementation tasks

- [x] Define and test the exact site-runtime and dependency-secret metadata
  schemas.
- [x] Render site-specific public env, dependency manifest, and two isolated
  Compose projects from that contract.
- [x] Remove hard-coded Hong Kong expectations from doctor/start planning and
  make backup gating capability-aware.
- [x] Add the versioned reference dependency Compose and resource admission.
- [x] Make canonical release-store adoption idempotent and evidence-bound.
- [ ] Split first start into authorization-bound dependency, migration,
  product-start, and acceptance phases. Dependency, migration/provision, and
  product-start executors are complete; acceptance remains open.
- [ ] Run focused, full, live disposable-infrastructure, and browser gates;
  publish a new immutable release only after all pass.

The dependency initialization planner is canonical-store-bound,
authorization-bound, and non-mutating by default. Runtime owners are resolved
only from image-bound account-database inspection evidence. Images that run as
a declared non-root user use that identity; PostgreSQL and the TLS gateway use
explicit accounts that must exist in the exact image account database. Missing,
ambiguous, root, and out-of-range identities are rejected.

The first local apply slice now admits only the target-generated source subset,
renders a private JSON Dex configuration with S256 PKCE and durable SQLite
storage, and atomically materializes candidate-scoped projections for services
whose inputs already exist. Bootstrap-output files are not fabricated:
Vault Secret Broker remains explicitly pending until real Vault initialization
produces its AppRole identifiers. This materialization slice itself creates no
Docker network, volume, container, database, IdP process, or Vault process.

After Vault bootstrap has produced the declared recovery and AppRole outputs,
a second materializer validates the exact expanded source set and creates a
new `post-bootstrap` candidate rather than rewriting the pre-bootstrap
candidate. It adds the Broker-only AppRole projection, re-renders all paths for
the derived candidate, records the predecessor evidence digest, and still
creates no runtime object. Provider credentials remain Vault-managed and are
never fabricated or copied into this source directory.

The separately authorized dependency executor pulls only exact image digests,
materializes the pre-bootstrap candidate, creates the site-owned product
network, starts PostgreSQL, Dex, and Vault, and invokes a one-shot Ops service
to initialize and unseal Vault. It installs KV v2 and a narrowly scoped AppRole,
verifies AppRole login, revokes the initial root token, and replaces the
recovery file with a root-token-free record. It then materializes the immutable
post-bootstrap candidate, starts the Broker, Agent Node, and TLS gateway, and
runs an authenticated TLS verifier from the dependency network. Only that full
chain may write `DEPENDENCIES_READY_NOT_PRODUCT_MIGRATED`. Any failure retains a
review-required state and never deletes a network or volume, retries bootstrap,
or claims rollback.

Migration/provision and product start now have separate CLIs, authorization
references, predecessor-evidence digests, state files, and shared lifecycle
locking. Migration completion does not start a service. Product start consumes
that exact migration state, uses the site's declared loopback ports, and emits
restart-compatible `STARTED_NOT_ACCEPTED` evidence. Either phase retains
partial-mutation evidence and never performs automatic rollback or retry.

## Success criteria

1. Hong Kong and Hangzhou renders are independently valid and contain no
   cross-site coordinate, identity, network, volume, or Secret reference.
2. Base first start no longer requires ZOS coordinates when off-site backup is
   explicitly disabled, while acceptance reports the capability as missing.
3. A target cannot start from a candidate directory; it must have the exact
   canonical release-store state and digest-bound site contract.
4. Every dependency and product mutation is tied to a distinct authorization
   reference and failure-safe state transition.
5. The reference stack fits the declared host budget with required headroom.
6. All focused tests and `npm run verify` pass, then a later immutable release
   completes bilateral prepare-only before first-start authorization is sought
   again.

## Open decision

Approve or revise assumptions 1–5, especially the same-host reference
dependency topology and the requirement that Hangzhou use independent internal
HTTPS/OIDC coordinates before public ingress is authorized.
