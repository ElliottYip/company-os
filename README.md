# Company OS

Independent AI Native Company control plane for humans, agents, permissions,
approvals, evidence, and responsibility.

Copyright 2026 Yilun Ye. Company OS is licensed under the
[Apache License 2.0](LICENSE), except for separately licensed components and
third-party materials identified in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
and [the source manifest](docs/source-manifest.md). The AgentBoss School
subpackage remains MIT-licensed under its own license file.

## Run the phase-one scaffold

```bash
npm install
npm run dev
```

The default page is a deterministic fixture demo. It does not invoke a model,
agent, relay, tool, filesystem, credential, or production data source.

## Verify

```bash
npm run verify
```

This runs focused tests, dependency-boundary checks, strict TypeScript checking,
and an independent Vite production build.

Release admission additionally exercises a real Keycloak OIDC login, an
isolated PostgreSQL 16 backup/restore through the non-root operations image,
and the complete release-shaped self-hosted topology in Chromium:

```bash
npm run test:oidc:keycloak
npm run test:restore:postgres16
npm run test:upgrade:postgres16
npm run test:upgrade:postgres-major
npm run test:compose:self-hosted
npm run test:compose:managed-cloud
```

These commands create only temporary test infrastructure and remove it on exit.
They do not use production credentials or data.

Before the first isolated staging installation, run the read-only host doctor:

```bash
npm run ops:doctor:staging
```

It reports stable prerequisite codes for immutable images, public HTTPS
coordinates, Secret-file metadata, Docker/Compose, resource budgets and target
ports. It never reads Secret contents or changes the host. The fixed raft.xin
profile and admission order are documented in
[the staging runbook](docs/staging-raft-xin.md).

Create the Secret-free, digest-verified handoff directory from an already
qualified immutable release manifest with:

```bash
npm run release:staging-bundle -- release-manifest.json /absolute/empty/output
npm run release:staging-archive -- /absolute/output /absolute/company-os-staging.tgz
```

The command refuses to write inside the source tree or overwrite an existing
directory. Images remain in the registry and credentials remain in the target
Secret Manager; neither is copied into the handoff.

Start with [the product charter](docs/product-charter.md),
[architecture](docs/architecture.md), and [source manifest](docs/source-manifest.md).
The distinction between implemented contracts and production-complete evidence
is maintained in the
[production maturity baseline](docs/production-maturity-baseline.md).

The formal Web and API are independently deployable. One immutable Web build
receives its public API origin at container start, so managed-cloud and
self-hosted deployments do not fork the product UI. See the
[self-hosted deployment runbook](docs/self-hosted-deployment.md) for images,
Compose ordering, OIDC configuration, backup, upgrade and rollback boundaries.

Formal deployments can install independently versioned Connector packages and
list them in `COMPANY_OS_CONNECTOR_PACKAGES` (comma-separated npm package names).
Each package exports `createAgentExecutionPort`; local paths and URLs are not
accepted. With no packages configured, the control plane starts normally but
Agent approval and execution remain fail-closed. See
[the formal API contract](docs/formal-api.md#formal-connector-packages).

The repository now includes the separately installable
`@company-os/http-agent-node-connector`. It adapts a customer-operated HTTPS
execution node and is not itself an Agent. Its deployment contract, security
boundary, and node endpoints are documented in
[the HTTP Agent Node runbook](docs/http-agent-node-connector.md).

Formal deployments may install exactly one Secret Broker package through
`COMPANY_OS_SECRET_BROKER_PACKAGE`. The package exports
`createSecretBrokerRuntimePort`; only an installed npm package name is accepted.
With no package configured, Secret resolution and credential-backed model/data
routes remain fail-closed. Secret values are never returned by the formal Web
API or written to Company OS events.

The included `@company-os/http-secret-broker` package connects an
enterprise-operated HTTPS Broker without moving Secret material into Company
OS. See [the HTTP Secret Broker runbook](docs/http-secret-broker.md).

Formal Work dispatch can declare a bounded execution-preparation plan. Company
OS evaluates the exact data contracts and obtains short-lived, opaque Broker
grants before it releases the durable `SUBMIT` command. The Connector receives
only authorization, data/evidence, and execution-grant references; missing or
failed preparation leaves the command pending for safe redrive. See
[ADR 0026](docs/adr/0026-prepare-enterprise-execution-before-connector-delivery.md).

Model providers follow the same installed-package boundary through
`COMPANY_OS_MODEL_PROVIDER_PACKAGES` (comma-separated npm package names). Each
module exports `createModelProviderRuntimePort`. Routes are created disabled
and cannot be enabled until the installed provider capability, residency,
model reference, Secret Broker, and active company-owned credential reference
all match.

## AgentBoss School

The MIT-licensed AgentBoss School skill lives at
[`skills/agentboss-school`](skills/agentboss-school/SKILL.md). It teaches
delegation, accountable work, exact-action approvals, evidence review, and team
adoption through progressively loaded lessons and the deterministic Company OS
demo. Learner progress stays local by default; paid coaching and FDE are
optional, evidence-triggered paths rather than course gates.

The MIT license at [`skills/agentboss-school/LICENSE`](skills/agentboss-school/LICENSE)
applies to the School package. It does not silently relicense the rest of the
Company OS repository or third-party materials.

Validate its curriculum and a learner-state file with:

```bash
node skills/agentboss-school/scripts/validate-curriculum.mjs
node skills/agentboss-school/scripts/validate-state.mjs path/to/state.json
```

Install it into the default Codex skill directory with:

```bash
node skills/agentboss-school/scripts/install.mjs
```

The installer refuses to overwrite an existing copy. An explicit
`--replace` installation retains the previous directory as a timestamped
backup.

The School also includes a local, provider-neutral case RAG. The catalog starts
empty so no demo is misrepresented as a customer case. After adding an
authorized, source-labelled case, rebuild and query the deterministic index:

```bash
node skills/agentboss-school/scripts/build-case-index.mjs
node skills/agentboss-school/scripts/retrieve-cases.mjs "delegation approval" --top 3 --json
```

Graduates who meet the published Foundations rubric can submit for the
issuer-reviewed **Agent Boss Foundations Certificate**. The machine-verifiable
JSON credential is signed with Ed25519; a printable HTML certificate is only a
presentation of that signed record. Public listing in the
[`AgentBoss School Yearbook`](skills/agentboss-school/YEARBOOK.md) is separate
and opt-in. Paid coaching or FDE is never a certificate requirement.

The issuance workflow and key-management boundary are documented in
[`references/certification.md`](skills/agentboss-school/references/certification.md).
The repository intentionally contains no issuer private key, and its public
keyring starts empty until an operational key ceremony is completed.
