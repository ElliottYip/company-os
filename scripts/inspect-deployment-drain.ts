import { createHash } from "node:crypto";

import { assessDeploymentDrain } from "../application/assess-deployment-drain.ts";
import { readSecretFileEnvironment } from "../adapters/config/secret-file-environment.ts";
import { createCompanyDatabase } from "../adapters/persistence/postgres/company-database.ts";
import { PostgresDeploymentDrainState } from "../adapters/persistence/postgres/postgres-deployment-drain-state.ts";
import type { DeploymentDrainStatePort } from "../ports/deployment-drain-state-port.ts";

export async function inspectDeploymentDrain(supplied: {
  readonly source?: DeploymentDrainStatePort;
  readonly now?: () => string;
} = {}) {
  const now = supplied.now ?? (() => new Date().toISOString());
  const observedAt = now();
  if (supplied.source) return result(await supplied.source.capture(), observedAt);

  const connectionString = await readSecretFileEnvironment("COMPANY_OS_DATABASE_URL");
  if (!connectionString) throw new Error("COMPANY_OS_DATABASE_URL_REQUIRED");
  const database = createCompanyDatabase(connectionString);
  try {
    await database.ping();
    await database.checkSchema();
    return result(await new PostgresDeploymentDrainState(database.db).capture(), observedAt);
  } finally {
    await database.close();
  }
}

function result(companies: Awaited<ReturnType<DeploymentDrainStatePort["capture"]>>, observedAt: string) {
  const assessment = assessDeploymentDrain({ observedAt, companies });
  const exactSourceDigest = `sha256:${createHash("sha256")
    .update(canonicalJson(companies)).digest("hex")}`;
  return { ...assessment, exactSourceDigest };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  process.stdout.write(`${JSON.stringify(await inspectDeploymentDrain(), null, 2)}\n`);
}
