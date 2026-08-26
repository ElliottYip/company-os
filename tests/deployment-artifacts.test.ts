import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createReleaseManifest } from "../scripts/create-release-manifest.mjs";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the open-source release carries the selected Apache-2.0 license and distinct third-party notices", async () => {
  const [license, notice, thirdParty, packageJsonSource, agentPackage, dataPackage, brokerPackage,
    vaultBrokerPackage] = await Promise.all([
    read("LICENSE"), read("NOTICE"), read("THIRD_PARTY_NOTICES.md"), read("package.json"),
    read("connectors/http-agent-node/package.json"), read("connectors/http-data-node/package.json"),
    read("brokers/http-secret-broker/package.json"),
    read("brokers/vault-secret-broker/package.json"),
  ]);
  assert.match(license, /Apache License\s+Version 2\.0, January 2004/);
  assert.match(license, /Copyright 2026 Yilun Ye/);
  assert.match(notice, /Company OS/);
  assert.match(notice, /Copyright 2026 Yilun Ye/);
  assert.match(thirdParty, /Raft visual subset/);
  assert.match(thirdParty, /skills\/agentboss-school/);
  assert.match(thirdParty, /Docker CLI 29\.1\.3/);
  assert.match(thirdParty, /Docker\s+Compose plugin 5\.0\.0/);
  assert.match(thirdParty, /github\.com\/creack\/pty/);
  for (const source of [packageJsonSource, agentPackage, dataPackage, brokerPackage, vaultBrokerPackage]) {
    assert.equal(JSON.parse(source).license, "Apache-2.0");
  }
});

test("self-hosted deployment separates Web, API, migration, and PostgreSQL lifecycles", async () => {
  const compose = await read("deploy/compose.self-hosted.yml");
  assert.match(compose, /postgres:\n/);
  assert.match(compose, /migrate:\n/);
  assert.match(compose, /api:\n/);
  assert.match(compose, /web:\n/);
  assert.match(compose, /condition: service_completed_successfully/);
  assert.match(compose, /condition: service_healthy/);
  assert.match(compose, /company_os_postgres:\/var\/lib\/postgresql\/data/);
  assert.equal(compose.match(/dockerfile: deploy\/Dockerfile\.api/g)?.length, 1,
    "the migrate job must reuse the API image instead of racing a second build");
  assert.doesNotMatch(compose, /password:\s*(admin|password|company_os)\s*$/im);
});

test("deployment profiles separate migration ownership from the API runtime role", async () => {
  const [selfHosted, managedCloud, selfHostedExample, managedCloudExample] = await Promise.all([
    read("deploy/compose.self-hosted.yml"),
    read("deploy/compose.managed-cloud.yml"),
    read("deploy/self-hosted.env.example"),
    read("deploy/managed-cloud.env.example"),
  ]);
  for (const compose of [selfHosted, managedCloud]) {
    assert.match(compose, /provision-runtime:\n/);
    assert.match(compose, /scripts\/provision-postgres-runtime-role\.ts/);
    assert.match(compose, /condition: service_completed_successfully/);
  }
  assert.match(selfHosted, /COMPANY_OS_MIGRATION_DATABASE_URL:/);
  assert.match(selfHosted, /COMPANY_OS_RUNTIME_DATABASE_USER:/);
  assert.match(selfHosted, /COMPANY_OS_RUNTIME_DATABASE_PASSWORD:/);
  assert.match(managedCloud, /COMPANY_OS_MIGRATION_DATABASE_URL:/);
  for (const example of [selfHostedExample, managedCloudExample]) {
    assert.match(example, /^COMPANY_OS_RUNTIME_DATABASE_USER=company_os_runtime$/m);
    assert.match(example, /^COMPANY_OS_RUNTIME_DATABASE_PASSWORD=CHANGE_ME_/m);
  }
});

test("self-hosted encrypted backups are opt-in, scheduled, and keep the key outside the image", async () => {
  const [compose, example, packageJsonSource, workflow] = await Promise.all([
    read("deploy/compose.self-hosted.yml"),
    read("deploy/self-hosted.env.example"),
    read("package.json"),
    read(".github/workflows/verify.yml"),
  ]);
  assert.match(compose, /backup:\n[\s\S]*profiles: \["backup"\]/);
  assert.match(compose, /postgres-encrypted-backup\.ts/);
  assert.match(compose, /company_os_backups:\/backup/);
  assert.match(compose, /COMPANY_OS_BACKUP_ENCRYPTION_KEY: \$\{COMPANY_OS_BACKUP_ENCRYPTION_KEY:-\}/);
  assert.match(example, /COMPANY_OS_BACKUP_ENCRYPTION_KEY=CHANGE_ME_BASE64_32_BYTE_KEY/);
  assert.match(example, /COMPANY_OS_BACKUP_INTERVAL_SECONDS=86400/);
  const scripts = JSON.parse(packageJsonSource).scripts;
  assert.equal(scripts["ops:encrypted-backup"],
    "node --experimental-strip-types scripts/postgres-encrypted-backup.ts");
  assert.equal(scripts["ops:encrypted-restore-drill"],
    "node --experimental-strip-types scripts/postgres-encrypted-restore-drill.ts");
  assert.equal(scripts["test:encrypted-backup:postgres16"],
    "node scripts/run-postgres-encrypted-backup-admission.mjs");
  assert.match(workflow, /npm run test:encrypted-backup:postgres16/);
  assert.doesNotMatch(compose, /COMPANY_OS_BACKUP_ENCRYPTION_KEY:\s*[A-Za-z0-9+/]{43}=/);
});

test("production images are pinned, non-root, health checked, and independently runnable", async () => {
  const [api, web, ops, packageJsonSource] = await Promise.all([
    read("deploy/Dockerfile.api"),
    read("deploy/Dockerfile.web"),
    read("deploy/Dockerfile.ops"),
    read("package.json"),
  ]);
  for (const dockerfile of [api, web]) {
    assert.match(dockerfile, /FROM node:22\.12\.0-bookworm-slim/);
    assert.match(dockerfile, /USER node/);
    assert.match(dockerfile, /HEALTHCHECK/);
    assert.doesNotMatch(dockerfile, /COPY \.env/);
  }
  assert.match(api, /service-entry\.ts/);
  assert.match(api, /^ENV COMPANY_OS_HOST=0\.0\.0\.0$/m,
    "the API image must accept traffic arriving through the container network");
  assert.match(web, /serve-web\.mjs/);
  assert.match(api, /npm ci --omit=dev --omit=optional --ignore-scripts/);
  assert.match(ops, /npm ci --omit=dev --omit=optional --ignore-scripts/);
  const packageJson = JSON.parse(packageJsonSource);
  assert.equal(packageJson.devDependencies["drizzle-kit"], undefined,
    "the unused migration CLI must not pull optional build tooling into production images");
  assert.equal(packageJson.scripts["security:dependencies"],
    "npm audit --omit=dev --omit=optional --audit-level=moderate");
  assert.equal(packageJson.scripts["release:sbom"],
    "npm sbom --omit=dev --omit=optional --sbom-format cyclonedx");
});

test("Codex Agent Node image pins the CLI and never bakes authentication or full-access flags", async () => {
  const [dockerfile, driverPackage, runbook] = await Promise.all([
    read("deploy/Dockerfile.codex-agent-node"),
    read("connectors/codex-exec-driver/package.json"),
    read("docs/codex-agent-node.md"),
  ]);
  assert.match(dockerfile, /ARG CODEX_CLI_VERSION=0\.144\.1/);
  assert.match(dockerfile, /@openai\/codex@\$\{CODEX_CLI_VERSION\}/);
  assert.match(dockerfile, /USER node/);
  assert.doesNotMatch(dockerfile, /COPY[^\n]*(?:\.codex|auth\.json|\.env)/i);
  assert.doesNotMatch(dockerfile, /--yolo|danger-full-access|dangerously-bypass/);
  assert.equal(JSON.parse(driverPackage).license, "Apache-2.0");
  assert.match(runbook, /read-only sandbox/);
  assert.match(runbook, /never receives the Codex login token/i);
});

test("Vault Secret Broker image is non-root and accepts credentials only from runtime files", async () => {
  const [dockerfile, example, runbook, compose] = await Promise.all([
    read("deploy/Dockerfile.vault-secret-broker"),
    read("deploy/vault-secret-broker.env.example"),
    read("docs/http-secret-broker.md"),
    read("deploy/compose.vault-broker.yml"),
  ]);
  assert.match(dockerfile, /FROM node:22\.12\.0-bookworm-slim/);
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /HEALTHCHECK/);
  assert.doesNotMatch(dockerfile, /COPY[^\n]*(?:\.env|role-id|secret-id|bearer-token)/i);
  for (const name of ["VAULT_ROLE_ID", "VAULT_SECRET_ID", "CONTROL_BEARER_TOKEN", "EXECUTION_BEARER_TOKEN"]) {
    assert.match(example, new RegExp(`COMPANY_OS_.*${name}_FILE=`));
  }
  assert.match(example, /^COMPANY_OS_VAULT_BROKER_MANAGEMENT_SIGNING_KEY_FILE=/m);
  assert.match(example, /^COMPANY_OS_VAULT_BROKER_REFERENCE_STATE_FILE=/m);
  assert.match(example, /^COMPANY_OS_VAULT_BROKER_PUBLIC_URL=https:\/\//m);
  assert.doesNotMatch(example, /(?:hvs\.|sk-)[A-Za-z0-9_-]{16,}/);
  assert.match(runbook, /one Codex\s+Agent Node/i);
  assert.match(runbook, /not a production-readiness claim/i);
  assert.match(compose, /COMPANY_OS_VAULT_SECRET_BROKER_IMAGE:\?set an immutable/);
  assert.match(compose, /127\.0\.0\.1:\$\{COMPANY_OS_VAULT_BROKER_PORT:-4321\}:4321/);
  assert.match(compose, /read_only: true/);
  assert.match(compose, /cap_drop: \[ALL\]/);
  assert.match(compose, /management-signing-key/);
  assert.doesNotMatch(compose, /(?:hvs\.|sk-)[A-Za-z0-9_-]{16,}/);
});

test("the Vault Broker has a pinned real-Vault compatibility admission", async () => {
  const [admission, packageJsonSource, workflow, runbook] = await Promise.all([
    read("scripts/run-vault-compatibility-admission.mjs"),
    read("package.json"),
    read(".github/workflows/verify.yml"),
    read("docs/http-secret-broker.md"),
  ]);
  assert.match(admission, /hashicorp\/vault@sha256:[a-f0-9]{64}/);
  assert.match(admission, /sys\/mounts/);
  assert.match(admission, /sys\/auth\/approle/);
  assert.match(admission, /sys\/policies\/acl/);
  assert.match(admission, /auth\/approle\/role/);
  assert.match(admission, /createVaultKvV2Client/);
  assert.match(admission, /createVaultLeaseBroker/);
  assert.match(admission, /finally\s*\{/);
  assert.doesNotMatch(admission, /VAULT_DEV_ROOT_TOKEN_ID=[A-Za-z0-9_-]{16,}/);
  assert.equal(JSON.parse(packageJsonSource).scripts["test:vault:compatibility"],
    "node scripts/run-vault-compatibility-admission.mjs");
  assert.match(workflow, /npm run test:vault:compatibility/);
  assert.match(runbook, /real Vault compatibility admission/i);
});

test("self-hosted example contains placeholders rather than usable credentials", async () => {
  const [compose, example] = await Promise.all([
    read("deploy/compose.self-hosted.yml"),
    read("deploy/self-hosted.env.example"),
  ]);
  assert.match(example, /CHANGE_ME_LONG_RANDOM_DATABASE_PASSWORD/);
  assert.match(example, /CHANGE_ME_OIDC_CLIENT_SECRET/);
  assert.match(example, /CHANGE_ME_AT_LEAST_32_RANDOM_BYTES/);
  assert.match(example, /COMPANY_OS_PUBLIC_URL=https:\/\//);
  assert.match(example, /COMPANY_OS_WEB_ORIGINS=https:\/\//);
  assert.match(example, /COMPANY_OS_OIDC_REDIRECT_URI=https:\/\/.+\/api\/auth\/oauth2\/callback\/enterprise-oidc/);
  assert.doesNotMatch(compose, /COMPANY_OS_PUBLIC_URL:-http:/);
  assert.doesNotMatch(compose, /COMPANY_OS_OIDC_REDIRECT_URI:-http:/);
  for (const variable of [
    "COMPANY_OS_HTTP_AGENT_NODE_BASE_URL",
    "COMPANY_OS_HTTP_AGENT_NODE_BEARER_TOKEN",
    "COMPANY_OS_HTTP_SECRET_BROKER_BASE_URL",
    "COMPANY_OS_HTTP_SECRET_BROKER_BEARER_TOKEN",
  ]) {
    assert.match(compose, new RegExp(`${variable}:`));
    assert.match(example, new RegExp(`^${variable}=`, "m"));
  }
  assert.doesNotMatch(example, /sk-[A-Za-z0-9_-]{16,}/);
});

test("managed-cloud profile reuses immutable API/Web artifacts and an external database", async () => {
  const [compose, example] = await Promise.all([
    read("deploy/compose.managed-cloud.yml"),
    read("deploy/managed-cloud.env.example"),
  ]);
  assert.match(compose, /COMPANY_OS_PROFILE: managed-cloud/);
  assert.match(compose, /COMPANY_OS_API_IMAGE:\?set an immutable API image digest/);
  assert.match(compose, /COMPANY_OS_WEB_IMAGE:\?set an immutable Web image digest/);
  assert.match(compose, /condition: service_completed_successfully/);
  assert.doesNotMatch(compose, /postgres:\n/);
  assert.match(example, /@sha256:CHANGE_ME_64_HEX_DIGEST/);
  assert.match(compose, /COMPANY_OS_HTTP_AGENT_NODE_ALLOW_INSECURE_LOOPBACK: "false"/);
  assert.match(compose, /COMPANY_OS_HTTP_SECRET_BROKER_ALLOW_INSECURE_LOOPBACK: "false"/);
  assert.match(compose, /COMPANY_OS_HTTP_DATA_NODE_BASE_URL:/);
  assert.match(compose, /COMPANY_OS_HTTP_DATA_NODE_BEARER_TOKEN:/);
  assert.match(compose, /COMPANY_OS_HTTP_DATA_NODE_ALLOW_INSECURE_LOOPBACK: "false"/);
  assert.match(example, /^COMPANY_OS_HTTP_DATA_NODE_SOURCES=$/m);
  assert.doesNotMatch(example, /sk-[A-Za-z0-9_-]{16,}/);
});

test("raft.xin staging is isolated, dependency-bound, resource bounded, and file-secret based", async () => {
  const [compose, example, dependencies, runbook, packageJsonSource] = await Promise.all([
    read("deploy/compose.staging.yml"),
    read("deploy/staging.env.example"),
    read("deploy/staging-dependencies.example.json"),
    read("docs/staging-raft-xin.md"),
    read("package.json"),
  ]);
  assert.match(compose, /^name: company-os-staging$/m);
  assert.match(compose, /name: company-os-staging_internal/);
  assert.match(compose, /127\.0\.0\.1:4600:8080/);
  assert.match(compose, /127\.0\.0\.1:4601:4310/);
  assert.match(compose, /company-os\.raft\.xin/);
  assert.match(compose, /company-os-api\.raft\.xin/);
  assert.match(compose, /read_only: true/);
  assert.match(compose, /cap_drop: \[ALL\]/);
  assert.match(compose, /no-new-privileges:true/);
  assert.match(compose, /COMPANY_OS_DATABASE_URL_FILE:/);
  assert.match(compose, /COMPANY_OS_OIDC_CLIENT_SECRET_FILE:/);
  assert.match(compose, /COMPANY_OS_HTTP_AGENT_NODE_BEARER_TOKEN_FILE:/);
  assert.doesNotMatch(compose, /buzz-prod|generator001y|\/opt\/raft-relay|\/data\/raft-h3/);
  assert.doesNotMatch(compose, /^\s+postgres:\s*$/m);
  assert.doesNotMatch(example, /(?:password|secret|bearer)=\S+/i);
  assert.equal(JSON.parse(dependencies).schemaVersion, 1);
  assert.match(dependencies, /"ownership": "DEDICATED"/);
  assert.match(dependencies, /"versioning": true/);
  assert.doesNotMatch(dependencies, /(?:hvs\.|sk-)[A-Za-z0-9_-]{16,}/);
  assert.equal(JSON.parse(packageJsonSource).scripts["ops:validate:staging-dependencies"],
    "node --experimental-strip-types scripts/validate-staging-dependencies.ts");
  assert.match(runbook, /generator001y.*forbidden/i);
  assert.match(runbook, /staging-dependencies\.json/);
  assert.match(runbook, /previous immutable image digests/);
});

test("release manifest binds source, immutable images, lockfile and ordered migrations", async () => {
  const manifest = await createReleaseManifest({
    COMPANY_OS_RELEASE_VERSION: "1.2.3",
    COMPANY_OS_SOURCE_REVISION: "a".repeat(40),
    COMPANY_OS_SOURCE_REPOSITORY: "https://github.com/example/company-os",
    COMPANY_OS_RELEASE_TAG: "v1.2.3",
    COMPANY_OS_QUALIFICATION_RUN_ID: "123456789",
    COMPANY_OS_QUALIFICATION_RUN_ATTEMPT: "1",
    COMPANY_OS_QUALIFICATION_RUN_URI: "https://github.com/example/company-os/actions/runs/123456789",
    COMPANY_OS_API_IMAGE: `registry.example/api@sha256:${"b".repeat(64)}`,
    COMPANY_OS_WEB_IMAGE: `registry.example/web@sha256:${"c".repeat(64)}`,
    COMPANY_OS_OPS_IMAGE: `registry.example/ops@sha256:${"d".repeat(64)}`,
    COMPANY_OS_CODEX_AGENT_NODE_IMAGE: `registry.example/codex-agent-node@sha256:${"e".repeat(64)}`,
    COMPANY_OS_VAULT_SECRET_BROKER_IMAGE: `registry.example/vault-secret-broker@sha256:${"f".repeat(64)}`,
  });
  assert.equal(manifest.sourceRevision, "a".repeat(40));
  assert.deepEqual(manifest.provenance, {
    sourceRepository: "https://github.com/example/company-os",
    releaseTag: "v1.2.3",
    workflowPath: ".github/workflows/release.yml",
    workflowEvent: "push",
    qualificationRun: {
      id: "123456789",
      attempt: "1",
      uri: "https://github.com/example/company-os/actions/runs/123456789",
    },
  });
  assert.deepEqual(manifest.profiles, ["managed-cloud", "self-hosted"]);
  assert.equal(manifest.images.ops, `registry.example/ops@sha256:${"d".repeat(64)}`);
  assert.equal(manifest.images.codexAgentNode, `registry.example/codex-agent-node@sha256:${"e".repeat(64)}`);
  assert.equal(manifest.images.vaultSecretBroker, `registry.example/vault-secret-broker@sha256:${"f".repeat(64)}`);
  assert.deepEqual(manifest.contracts, {
    formalApi: "v1",
    connectorEnvelope: "1.0",
    agentNode: "1.0",
    dataNode: "1.0",
    secretBroker: "1.0",
  });
  assert.deepEqual(manifest.runtime, { node: "22.12.0", postgresqlMajor: 16, codexCli: "0.144.1" });
  assert.ok(manifest.qualification.requiredCommands.includes("npm run verify"));
  assert.ok(manifest.qualification.requiredCommands.includes("npm run test:customer-boundaries:tls"));
  assert.match(manifest.packageLockDigest, /^sha256:[a-f0-9]{64}$/);
  assert.ok(manifest.database.migrations.length > 0);
  assert.deepEqual(
    manifest.database.migrations.map(({ name }) => name),
    [...manifest.database.migrations.map(({ name }) => name)].sort(),
  );
  assert.equal(manifest.rollback.automaticDownMigration, false);
  assert.equal(manifest.cutover.requiresDistinctPreviousRelease, true);
  assert.match(manifest.cutover.planCommand, /previous-manifest\.json/);
  assert.doesNotMatch(JSON.stringify(manifest),
    /"(?:password|accessToken|refreshToken|clientSecret|bearerToken|credentialValue)"\s*:/i);
});

test("release manifest rejects a tag or qualification run outside its exact repository", async () => {
  const base = {
    COMPANY_OS_RELEASE_VERSION: "1.2.3-rc.1",
    COMPANY_OS_SOURCE_REVISION: "a".repeat(40),
    COMPANY_OS_SOURCE_REPOSITORY: "https://github.com/example/company-os",
    COMPANY_OS_RELEASE_TAG: "v1.2.3-rc.1",
    COMPANY_OS_QUALIFICATION_RUN_ID: "123456789",
    COMPANY_OS_QUALIFICATION_RUN_ATTEMPT: "2",
    COMPANY_OS_QUALIFICATION_RUN_URI: "https://github.com/example/company-os/actions/runs/123456789",
    COMPANY_OS_API_IMAGE: `registry.example/api@sha256:${"b".repeat(64)}`,
    COMPANY_OS_WEB_IMAGE: `registry.example/web@sha256:${"c".repeat(64)}`,
    COMPANY_OS_OPS_IMAGE: `registry.example/ops@sha256:${"d".repeat(64)}`,
    COMPANY_OS_CODEX_AGENT_NODE_IMAGE: `registry.example/codex-agent-node@sha256:${"e".repeat(64)}`,
    COMPANY_OS_VAULT_SECRET_BROKER_IMAGE: `registry.example/vault-secret-broker@sha256:${"f".repeat(64)}`,
  };
  await assert.rejects(() => createReleaseManifest({ ...base, COMPANY_OS_RELEASE_TAG: "v1.2.3" }),
    /COMPANY_OS_RELEASE_TAG_MISMATCH/);
  await assert.rejects(() => createReleaseManifest({ ...base,
    COMPANY_OS_QUALIFICATION_RUN_URI: "https://github.com/other/company-os/actions/runs/123456789" }),
  /COMPANY_OS_QUALIFICATION_RUN_URI_MISMATCH/);
});

test("release automation publishes five digest-addressed images with SBOM and provenance", async () => {
  const [workflow, opsDockerfile] = await Promise.all([
    read(".github/workflows/release.yml"),
    read("deploy/Dockerfile.ops"),
  ]);
  assert.match(workflow, /environment: production-release/);
  assert.match(workflow, /push:\n\s+tags:\n\s+- "v\*"/);
  assert.doesNotMatch(workflow, /release:\n\s+types: \[published\]/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /Validate immutable release tag/);
  assert.match(workflow, /git rev-list -n 1/);
  assert.match(workflow, /qualify:\n/);
  assert.match(workflow, /publish:\n\s+needs: qualify/);
  assert.match(workflow, /qualify:[\s\S]*permissions:\n\s+contents: read/);
  assert.match(workflow, /qualify:[\s\S]*npm run verify/);
  assert.match(workflow, /qualify:[\s\S]*npm run test:compose:self-hosted/);
  assert.match(workflow, /qualify:[\s\S]*npm run test:compose:managed-cloud/);
  assert.match(workflow, /qualify:[\s\S]*npm run test:soak:http/);
  assert.match(workflow, /publish:[\s\S]*packages: write/);
  assert.match(workflow, /test -f LICENSE/);
  assert.match(workflow, /deploy\/Dockerfile\.api/);
  assert.match(workflow, /deploy\/Dockerfile\.web/);
  assert.match(workflow, /deploy\/Dockerfile\.ops/);
  assert.match(workflow, /sbom: true/);
  assert.match(workflow, /provenance: mode=max/);
  assert.match(workflow, /actions\/attest@[a-f0-9]{40}/);
  assert.match(workflow, /COMPANY_OS_OPS_IMAGE/);
  assert.match(workflow, /COMPANY_OS_SOURCE_REPOSITORY: \$\{\{ github\.server_url \}\}\/\$\{\{ github\.repository \}\}/);
  assert.match(workflow, /COMPANY_OS_RELEASE_TAG: \$\{\{ github\.ref_name \}\}/);
  assert.match(workflow, /COMPANY_OS_QUALIFICATION_RUN_ID: \$\{\{ github\.run_id \}\}/);
  assert.match(workflow, /COMPANY_OS_QUALIFICATION_RUN_ATTEMPT: \$\{\{ github\.run_attempt \}\}/);
  assert.match(workflow, /COMPANY_OS_CODEX_AGENT_NODE_IMAGE/);
  assert.match(workflow, /deploy\/Dockerfile\.codex-agent-node/);
  assert.match(workflow, /deploy\/Dockerfile\.vault-secret-broker/);
  assert.equal((workflow.match(/docker\/build-push-action@/g) ?? []).length, 5);
  assert.match(workflow, /Publish the GitHub release after all evidence exists/);
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /--prerelease/);
  assert.doesNotMatch(workflow, /gh release upload/);
  assert.ok(workflow.indexOf("Generate release manifest and application SBOM") <
    workflow.indexOf("Publish the GitHub release after all evidence exists"));
  assert.doesNotMatch(workflow, /uses: [^\n]+@(main|master|v\d+)\s*$/m);
  assert.doesNotMatch(workflow, /:latest\b/);
  assert.match(opsDockerfile, /FROM postgres:16(?:\.\d+)?-bookworm@sha256:[a-f0-9]{64} AS postgres-tools/);
  assert.match(opsDockerfile, /FROM postgres-tools AS runtime/);
  assert.match(opsDockerfile,
    /FROM docker:29\.1\.3-cli@sha256:4fa0ee1f3a7e4354c4ea34558b6d4ee32859baf4973d4c8ccc8e7fe3dd730c04 AS docker-cli/);
  assert.match(opsDockerfile, /COPY --from=docker-cli \/usr\/local\/bin\/docker \/usr\/local\/bin\/docker/);
  assert.match(opsDockerfile,
    /COPY --from=docker-cli \/usr\/local\/libexec\/docker\/cli-plugins\/docker-compose \/usr\/local\/libexec\/docker\/cli-plugins\/docker-compose/);
  assert.match(opsDockerfile, /COPY --from=node-runtime \/usr\/local\/bin\/node/);
  assert.doesNotMatch(opsDockerfile, /apt-get install[^\n]*postgresql-client/);
  assert.match(opsDockerfile, /USER node/);
  assert.match(opsDockerfile, /postgres-restore-drill\.ts/);
});

test("CI uses immutable database infrastructure and admits both live identity providers", async () => {
  const workflow = await read(".github/workflows/verify.yml");
  assert.match(workflow, /image: postgres:16\.15-bookworm@sha256:[a-f0-9]{64}/);
  assert.match(workflow, /run: npm run verify/);
  assert.match(workflow, /run: npm run test:oidc:keycloak/);
  assert.doesNotMatch(workflow, /image: postgres:(?:latest|16-alpine)/);
});

test("release-shaped Compose admission preserves accountable state across database and API restart", async () => {
  const admission = await read("scripts/run-self-hosted-compose-admission.mjs");
  assert.match(admission, /captureDurableState/);
  assert.match(admission, /company_os_auth_session/);
  assert.match(admission, /company_os_domain_event/);
  assert.match(admission, /docker\("restart", databaseContainer\)/);
  assert.match(admission, /compose\("restart", "api"\)/);
  assert.match(admission, /COMPOSE_ADMISSION_DURABLE_STATE_CHANGED/);
  assert.match(admission, /COMPOSE_ADMISSION_DURABLE_STATE_EMPTY/);
});

test("CI proves the customer IdP and neutral node boundary over verified TLS", async () => {
  const [workflow, packageJsonSource, admission] = await Promise.all([
    read(".github/workflows/verify.yml"),
    read("package.json"),
    read("scripts/run-customer-boundary-tls-admission.mjs"),
  ]);
  const scripts = JSON.parse(packageJsonSource).scripts;
  assert.equal(scripts["test:customer-boundaries:tls"],
    "node scripts/run-customer-boundary-tls-admission.mjs");
  assert.match(workflow, /npm run test:customer-boundaries:tls/);
  assert.match(admission, /NODE_EXTRA_CA_CERTS/);
  assert.match(admission, /customer-boundary-preflight\.ts/);
  assert.doesNotMatch(admission, /NODE_TLS_REJECT_UNAUTHORIZED/);
});

test("release qualification owns a sustained same-process HTTP soak gate", async () => {
  const [workflow, packageJsonSource, soak] = await Promise.all([
    read(".github/workflows/release.yml"), read("package.json"), read("scripts/http-soak-admission.ts"),
  ]);
  const scripts = JSON.parse(packageJsonSource).scripts;
  assert.equal(scripts["test:soak:http"], "node --experimental-strip-types scripts/http-soak-admission.ts");
  assert.match(workflow, /npm run test:soak:http/);
  assert.match(soak, /minimumDurationMilliseconds: 30_000/);
});

test("staging first install has read-only diagnostics, exact handoff, prepare-only store, and authorized start", async () => {
  const [packageJsonSource, doctor, bundle, installer, starter, inspector, drainInspector,
    adoptionVerifier, restarter, runbook] = await Promise.all([
    read("package.json"), read("scripts/staging-deployment-doctor.ts"),
    read("scripts/create-staging-release-bundle.mjs"),
    read("scripts/install-staging-release-bundle.mjs"), read("scripts/start-staging-release.mjs"),
    read("scripts/inspect-staging-runtime.mjs"), read("scripts/inspect-deployment-drain.ts"),
    read("scripts/verify-deployment-state-adoption.ts"),
    read("scripts/restart-staging-release.mjs"),
    read("docs/staging-raft-xin.md"),
  ]);
  const scripts = JSON.parse(packageJsonSource).scripts;
  assert.equal(scripts["ops:doctor:staging"],
    "node --experimental-strip-types scripts/staging-deployment-doctor.ts");
  assert.match(doctor, /evaluateStagingDeploymentReadiness/);
  assert.match(doctor, /lstat/);
  assert.match(doctor, /hostRuntime\(options\.root\)/);
  assert.match(doctor, /statfs\(root\)/);
  assert.doesNotMatch(doctor, /readFile\(`\$\{path\}\/\$\{name\}`/);
  assert.equal(scripts["release:staging-bundle"], "node scripts/create-staging-release-bundle.mjs");
  assert.match(bundle, /COMPANY_OS_STAGING_RELEASE_BUNDLE/);
  assert.match(bundle, /secretMaterialIncluded: false/);
  assert.equal(scripts["release:staging-install"], "node scripts/install-staging-release-bundle.mjs");
  assert.match(installer, /PLANNED_NOT_APPLIED/);
  assert.match(installer, /INSTALLED_NOT_STARTED/);
  assert.match(installer, /verifyStagingReleaseBundle/);
  assert.doesNotMatch(installer, /(?:spawn|execFile|execSync|spawnSync)\s*\(/);
  assert.match(runbook, /COMPANY_OS_VERIFIED_OPS_IMAGE/);
  assert.match(runbook, /--mount type=bind,src=\/var\/run\/docker\.sock/);
  assert.match(runbook, /npm run release:staging-bundle/);
  assert.match(runbook, /node scripts\/install-staging-release-bundle\.mjs/);
  assert.match(runbook, /--network none/);
  assert.match(runbook, /first-install-only and logically read-only/);
  assert.equal(scripts["release:staging-start"],
    "node --experimental-strip-types scripts/start-staging-release.mjs");
  assert.match(starter, /STARTED_NOT_ACCEPTED/);
  assert.match(starter, /START_FAILED_REQUIRES_REVIEW/);
  assert.match(starter, /STAGING_START_ALREADY_RUNNING/);
  assert.match(starter, /authorizationReference/);
  assert.doesNotMatch(starter, /docker[^\n]*(?:down|rm)|down-migration|rollback\s*\(/i);
  assert.match(runbook, /node --experimental-strip-types scripts\/start-staging-release\.mjs/);
  assert.match(runbook, /--authorization change:/);
  assert.match(runbook, /STARTED_NOT_ACCEPTED/);
  assert.equal(scripts["ops:status:staging"],
    "node --experimental-strip-types scripts/inspect-staging-runtime.mjs");
  assert.match(inspector, /evaluateStagingRuntimeStatus/);
  assert.match(inspector, /resolveStagingReleaseRecord/);
  assert.match(inspector, /candidate/);
  assert.match(inspector, /com\.docker\.compose\.project=company-os-staging/);
  assert.doesNotMatch(inspector,
    /\.Config\.Env|["']docker["']\s*,\s*["'](?:start|stop|restart|rm|kill)["']/);
  assert.match(runbook, /RUNNING_NOT_ACCEPTED/);
  assert.equal(scripts["ops:drain:staging"],
    "node --experimental-strip-types scripts/inspect-deployment-drain.ts");
  assert.match(drainInspector, /COMPANY_OS_DATABASE_URL/);
  assert.match(drainInspector, /PostgresDeploymentDrainState/);
  assert.doesNotMatch(drainInspector, /console\.(?:log|error)|process\.env\.COMPANY_OS_DATABASE_URL/);
  assert.match(runbook, /Only `DRAINED` with `restartAllowed: true`/);
  assert.equal(scripts["ops:adoption:staging"],
    "node --experimental-strip-types scripts/verify-deployment-state-adoption.ts");
  assert.match(adoptionVerifier, /ADOPTION_VERIFIED/);
  assert.match(adoptionVerifier, /DURABLE_STATE_DIGEST_CHANGED/);
  assert.match(runbook, /verify-deployment-state-adoption\.ts/);
  assert.equal(scripts["release:staging-restart"],
    "node --experimental-strip-types scripts/restart-staging-release.mjs");
  assert.match(restarter, /\.staging-lifecycle\.lock/);
  assert.match(restarter, /RESTARTED_NOT_ACCEPTED/);
  assert.match(restarter, /RESTART_FAILED_REQUIRES_REVIEW/);
  assert.match(restarter, /STATE_ADOPTION/);
  assert.doesNotMatch(restarter, /["'](?:down|up|pull|run|rm)["']/);
  assert.match(runbook, /restart-staging-release\.mjs/);
});
