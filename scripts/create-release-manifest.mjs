import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const required = (environment, name, pattern) => {
  const value = environment[name]?.trim();
  if (!value || !pattern.test(value)) throw new Error(`${name}_INVALID`);
  return value;
};

export async function createReleaseManifest(environment = process.env) {
    const sourceRevision = required(environment, "COMPANY_OS_SOURCE_REVISION", /^[a-f0-9]{40}$/);
    const apiImage = required(environment, "COMPANY_OS_API_IMAGE", /@sha256:[a-f0-9]{64}$/);
    const webImage = required(environment, "COMPANY_OS_WEB_IMAGE", /@sha256:[a-f0-9]{64}$/);
    const opsImage = required(environment, "COMPANY_OS_OPS_IMAGE", /@sha256:[a-f0-9]{64}$/);
    const codexAgentNodeImage = required(environment, "COMPANY_OS_CODEX_AGENT_NODE_IMAGE", /@sha256:[a-f0-9]{64}$/);
    const vaultSecretBrokerImage = required(environment, "COMPANY_OS_VAULT_SECRET_BROKER_IMAGE", /@sha256:[a-f0-9]{64}$/);
    const referenceDataNodeImage = required(environment, "COMPANY_OS_REFERENCE_DATA_NODE_IMAGE", /@sha256:[a-f0-9]{64}$/);
    const releaseVersion = required(environment, "COMPANY_OS_RELEASE_VERSION", /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/);
    const sourceRepository = required(environment, "COMPANY_OS_SOURCE_REPOSITORY",
      /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
    const releaseTag = required(environment, "COMPANY_OS_RELEASE_TAG",
      /^v[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/);
    const qualificationRunId = required(environment, "COMPANY_OS_QUALIFICATION_RUN_ID", /^[1-9][0-9]{0,19}$/);
    const qualificationRunAttempt = required(environment, "COMPANY_OS_QUALIFICATION_RUN_ATTEMPT", /^[1-9][0-9]{0,5}$/);
    const qualificationRunUri = required(environment, "COMPANY_OS_QUALIFICATION_RUN_URI",
      /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/[1-9][0-9]{0,19}$/);
    if (releaseTag !== `v${releaseVersion}`) throw new Error("COMPANY_OS_RELEASE_TAG_MISMATCH");
    if (qualificationRunUri !== `${sourceRepository}/actions/runs/${qualificationRunId}`) {
      throw new Error("COMPANY_OS_QUALIFICATION_RUN_URI_MISMATCH");
    }
    const root = new URL("../", import.meta.url);
    const lockfile = await readFile(new URL("package-lock.json", root));
    const migrationsDirectory = new URL("adapters/persistence/postgres/migrations/", root);
    const migrationNames = (await readdir(migrationsDirectory)).filter((name) => name.endsWith(".sql")).sort();
    const migrations = [];
    for (const name of migrationNames) {
      const source = await readFile(new URL(name, migrationsDirectory));
      migrations.push({ name, digest: sha256(source) });
    }
    return {
      schemaVersion: 1,
      product: "company-os",
      releaseVersion,
      sourceRevision,
      provenance: {
        sourceRepository,
        releaseTag,
        workflowPath: ".github/workflows/release.yml",
        workflowEvent: "push",
        qualificationRun: {
          id: qualificationRunId,
          attempt: qualificationRunAttempt,
          uri: qualificationRunUri,
        },
      },
      profiles: ["managed-cloud", "self-hosted"],
      images: {
        api: apiImage,
        web: webImage,
        ops: opsImage,
        codexAgentNode: codexAgentNodeImage,
        vaultSecretBroker: vaultSecretBrokerImage,
        referenceDataNode: referenceDataNodeImage,
      },
      contracts: {
        formalApi: "v1",
        connectorEnvelope: "1.0",
        agentNode: "1.0",
        dataNode: "1.0",
        secretBroker: "1.0",
      },
      runtime: { node: "22.12.0", postgresqlMajor: 16, codexCli: "0.144.1" },
      qualification: {
        requiredCommands: [
          "npm run verify",
          "npm run test:oidc:keycloak",
          "npm run test:restore:postgres16",
          "npm run test:encrypted-backup:postgres16",
          "npm run test:runtime-role:postgres16",
          "npm run test:upgrade:postgres16",
          "npm run test:upgrade:postgres-major",
          "npm run test:customer-boundaries:tls",
          "npm run test:vault:compatibility",
          "npm run test:soak:http",
          "npm run test:compose:self-hosted",
          "npm run test:compose:managed-cloud",
        ],
      },
      packageLockDigest: sha256(lockfile),
      database: { engine: "postgresql", migrations },
      rollback: {
        automaticDownMigration: false,
        requiresCompatibleBinaryOrPairedRestore: true,
      },
      cutover: {
        planCommand: "npm run release:cutover-plan -- <previous-manifest.json> <current-manifest.json>",
        requiresDistinctPreviousRelease: true,
        executionEvidenceRetainedExternally: true,
      },
    };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  process.stdout.write(`${JSON.stringify(await createReleaseManifest(), null, 2)}\n`);
}
