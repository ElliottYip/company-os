import { createHash } from "node:crypto";

import { readSecretFileEnvironment } from "../adapters/config/secret-file-environment.ts";
import { createFeishuDirectorySource } from "../adapters/identity/feishu-directory-source.ts";
import type { EnterpriseDirectorySnapshot } from "../ports/enterprise-directory-source-port.ts";

function required(value: string | undefined, code: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function validateSnapshot(snapshot: EnterpriseDirectorySnapshot): void {
  const departmentIds = new Set(snapshot.departments.map(({ externalId }) => externalId));
  if (departmentIds.size !== snapshot.departments.length) {
    throw new Error("FEISHU_DIRECTORY_DUPLICATE_DEPARTMENT");
  }
  for (const department of snapshot.departments) {
    if (department.parentExternalId !== null && !departmentIds.has(department.parentExternalId)) {
      throw new Error("FEISHU_DIRECTORY_ORPHAN_DEPARTMENT");
    }
  }
  const humanIds = new Set(snapshot.humans.map(({ externalId }) => externalId));
  if (humanIds.size !== snapshot.humans.length) throw new Error("FEISHU_DIRECTORY_DUPLICATE_HUMAN");
  for (const human of snapshot.humans) {
    if (human.departmentExternalIds.some((departmentId) =>
      departmentId !== "0" && !departmentIds.has(departmentId))) {
      throw new Error("FEISHU_DIRECTORY_ORPHAN_HUMAN");
    }
  }
}

async function main(): Promise<void> {
  const appSecret = await readSecretFileEnvironment("COMPANY_OS_FEISHU_APP_SECRET");
  const source = createFeishuDirectorySource({
    appId: required(process.env.COMPANY_OS_FEISHU_APP_ID, "FEISHU_APP_ID_REQUIRED"),
    appSecret: required(appSecret, "FEISHU_APP_SECRET_REQUIRED"),
    tenantKey: required(process.env.COMPANY_OS_FEISHU_TENANT_KEY, "FEISHU_TENANT_KEY_REQUIRED"),
  });
  const snapshot = await source.readSnapshot();
  validateSnapshot(snapshot);
  const digest = createHash("sha256").update(JSON.stringify({
    sourceTenantId: snapshot.sourceTenantId,
    departments: snapshot.departments.map(({ externalId, parentExternalId, active }) =>
      ({ externalId, parentExternalId, active })).sort((a, b) => a.externalId.localeCompare(b.externalId)),
    humans: snapshot.humans.map(({ externalId, departmentExternalIds, active, enterpriseEmail }) => ({
      externalId, departmentExternalIds: [...departmentExternalIds].sort(), active,
      hasEnterpriseEmail: enterpriseEmail !== null,
    })).sort((a, b) => a.externalId.localeCompare(b.externalId)),
  })).digest("hex");
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    status: "PASS",
    source: "FEISHU",
    readOnly: true,
    tenantMatched: snapshot.sourceTenantId === process.env.COMPANY_OS_FEISHU_TENANT_KEY?.trim(),
    capturedAt: snapshot.capturedAt.toISOString(),
    departmentCount: snapshot.departments.length,
    activeDepartmentCount: snapshot.departments.filter(({ active }) => active).length,
    humanCount: snapshot.humans.length,
    activeHumanCount: snapshot.humans.filter(({ active }) => active).length,
    humansWithEnterpriseEmail: snapshot.humans.filter(({ enterpriseEmail }) => enterpriseEmail !== null).length,
    snapshotDigest: `sha256:${digest}`,
    rawPersonalDataIncluded: false,
    secretMaterialIncluded: false,
  }, null, 2)}\n`);
}

await main();
