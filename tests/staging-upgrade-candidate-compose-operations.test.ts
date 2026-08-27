import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createStagingUpgradeCandidateComposeOperations } from
  "../scripts/staging-upgrade-candidate-compose-operations.ts";

const digest = (value: string) => `sha256:${value.repeat(64)}`;
const images = { api: `registry.example/api@${digest("1")}`, web: `registry.example/web@${digest("2")}`,
  broker: `registry.example/broker@${digest("3")}`, agent: `registry.example/agent@${digest("4")}`,
  data: `registry.example/data@${digest("5")}` };

async function fixture(context: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), "company-os-candidate-compose-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const candidate = join(root, "candidate"); await mkdir(candidate, { mode: 0o700 });
  const env = [
    `COMPANY_OS_API_IMAGE=${images.api}`, `COMPANY_OS_WEB_IMAGE=${images.web}`,
    `COMPANY_OS_VAULT_SECRET_BROKER_IMAGE=${images.broker}`,
    `COMPANY_OS_CODEX_AGENT_NODE_IMAGE=${images.agent}`,
    `COMPANY_OS_REFERENCE_DATA_NODE_IMAGE=${images.data}`,
    "COMPANY_OS_API_LOOPBACK_PORT=14601", "COMPANY_OS_WEB_LOOPBACK_PORT=14600",
  ].join("\n") + "\n";
  await Promise.all([
    writeFile(join(candidate, "candidate.env"), env, { mode: 0o600 }),
    writeFile(join(candidate, "compose.staging.yml"), "services: {}\n", { mode: 0o600 }),
    writeFile(join(candidate, "compose.staging-upgrade-candidate.yml"), "services: {}\n", { mode: 0o600 }),
  ]);
  return candidate;
}

test("candidate Compose operations start dependency topology before API readiness", async (context) => {
  const candidateDirectory = await fixture(context); const commands: string[][] = []; const probes: string[] = [];
  const serviceImages: Record<string, string> = { "vault-secret-broker": images.broker,
    "reference-data-node": images.data, "codex-agent-node": images.agent, api: images.api, web: images.web };
  const operations = await createStagingUpgradeCandidateComposeOperations({ candidateDirectory,
    operationId: "upgrade-rc4-to-rc5", siteId: "company-os-test-site",
    candidateReleaseId: `0.1.0-rc.5-${"b".repeat(12)}` }, {
    now: () => "2026-08-27T12:00:00.000Z",
    runCommand: async (argv) => { commands.push([...argv]); const service = argv.at(-1)!;
      return { status: 0, stdout: argv.includes("ps")
        ? JSON.stringify([{ Service: service, Image: serviceImages[service], State: "running", Health: "healthy" }])
        : "" }; },
    probe: async (url) => { probes.push(url); return true; },
  });
  await operations["start-candidate-secret-broker"]();
  await operations["start-candidate-data-node"]();
  await operations["start-candidate-agent-node"]();
  await operations["start-candidate-api"]();
  const readiness = await operations["candidate-readiness"]();
  await operations["start-candidate-web"]();
  assert.equal(readiness.outcome, "DEPENDENCY_AWARE_READY");
  assert.deepEqual(probes, ["http://127.0.0.1:14601/ready", "http://127.0.0.1:14600/"]);
  const starts = commands.filter((argv) => argv.includes("up")).map((argv) => argv.at(-1));
  assert.deepEqual(starts, ["vault-secret-broker", "reference-data-node", "codex-agent-node", "api", "web"]);
  const evidence = await readFile(join(candidateDirectory, "step-evidence", "candidate-readiness.json"), "utf8");
  assert.doesNotMatch(evidence, /bearer.?token|password|database.?url|cookie/i);
});

test("candidate Compose operations reject image drift and unhealthy state", async (context) => {
  const candidateDirectory = await fixture(context);
  const operations = await createStagingUpgradeCandidateComposeOperations({ candidateDirectory,
    operationId: "upgrade-rc4-to-rc5", siteId: "company-os-test-site",
    candidateReleaseId: `0.1.0-rc.5-${"b".repeat(12)}` }, { runCommand: async (argv) => ({ status: 0,
      stdout: argv.includes("ps") ? JSON.stringify([{ Service: "vault-secret-broker",
        Image: "registry.example/wrong@" + digest("9"), State: "running", Health: "unhealthy" }]) : "" }) });
  await assert.rejects(operations["start-candidate-secret-broker"](),
    /STAGING_UPGRADE_CANDIDATE_SERVICE_NOT_RUNNING/);
});

test("candidate Web does not retain success evidence before its probe passes", async (context) => {
  const candidateDirectory = await fixture(context);
  const operations = await createStagingUpgradeCandidateComposeOperations({ candidateDirectory,
    operationId: "upgrade-rc4-to-rc5", siteId: "company-os-test-site",
    candidateReleaseId: `0.1.0-rc.5-${"b".repeat(12)}` }, {
    runCommand: async (argv) => ({ status: 0, stdout: argv.includes("ps")
      ? JSON.stringify([{ Service: "web", Image: images.web, State: "running" }]) : "" }),
    probe: async () => false,
  });
  await assert.rejects(operations["start-candidate-web"](), /STAGING_UPGRADE_CANDIDATE_WEB_NOT_READY/);
  await assert.rejects(readFile(join(candidateDirectory, "step-evidence", "start-candidate-web.json"), "utf8"),
    (error: any) => error?.code === "ENOENT");
});
