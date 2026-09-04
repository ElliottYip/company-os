import { readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";

import {
  createReferenceDataNode,
  JsonFileReferenceDataNodeStore,
  loadReferenceDataNodeFixtureCatalog,
} from "./index.mjs";

function required(environment, name, maximum = 4_096) {
  const value = environment[name]?.trim();
  if (!value || value.length > maximum || value.includes("\0")) throw new Error(`${name}_REQUIRED`);
  return value;
}
function absolute(environment, name) {
  const value = required(environment, name);
  if (!isAbsolute(value)) throw new Error(`${name}_INVALID`);
  return value;
}
function secret(environment, name) {
  const inline = environment[name]?.trim();
  const path = environment[`${name}_FILE`]?.trim();
  if (inline && path) throw new Error(`${name}_SOURCE_AMBIGUOUS`);
  if (inline) return inline;
  if (!path || !isAbsolute(path) || path.includes("\0")) throw new Error(`${name}_FILE_REQUIRED`);
  const metadata = statSync(path);
  if (!metadata.isFile() || metadata.size < 16 || metadata.size > 16_384) throw new Error(`${name}_FILE_INVALID`);
  const value = readFileSync(path, "utf8").trim();
  if (value.length < 16) throw new Error(`${name}_FILE_INVALID`);
  return value;
}
function integer(environment, name, fallback, minimum, maximum) {
  const value = Number(environment[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${name}_INVALID`);
  return value;
}

function dropRuntimePrivileges(environment = process.env, runtime = process) {
  const rawUid = environment.COMPANY_OS_RUNTIME_UID?.trim();
  const rawGid = environment.COMPANY_OS_RUNTIME_GID?.trim();
  if (!rawUid && !rawGid) return;
  const uid = Number(rawUid);
  const gid = Number(rawGid);
  if (!Number.isSafeInteger(uid) || uid < 1 || !Number.isSafeInteger(gid) || gid < 1) {
    throw new Error("COMPANY_OS_RUNTIME_IDENTITY_INVALID");
  }
  if (runtime.getuid() === uid && runtime.getgid() === gid) return;
  if (runtime.getuid() !== 0) throw new Error("COMPANY_OS_RUNTIME_PRIVILEGE_DROP_FORBIDDEN");
  runtime.setgroups([]);
  runtime.setgid(gid);
  runtime.setuid(uid);
  if (runtime.getuid() !== uid || runtime.getgid() !== gid) {
    throw new Error("COMPANY_OS_RUNTIME_PRIVILEGE_DROP_FAILED");
  }
}

export async function createReferenceDataNodeService(environment = process.env) {
  const dataSources = await loadReferenceDataNodeFixtureCatalog(
    absolute(environment, "COMPANY_OS_REFERENCE_DATA_NODE_CATALOG_FILE"),
  );
  return createReferenceDataNode({
    bearerToken: secret(environment, "COMPANY_OS_REFERENCE_DATA_NODE_BEARER_TOKEN"),
    store: new JsonFileReferenceDataNodeStore(absolute(environment, "COMPANY_OS_REFERENCE_DATA_NODE_STATE_FILE")),
    dataSources,
    maximumRequestBytes: integer(environment, "COMPANY_OS_REFERENCE_DATA_NODE_MAXIMUM_REQUEST_BYTES",
      262_144, 16_384, 1_048_576),
  });
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const host = process.env.COMPANY_OS_REFERENCE_DATA_NODE_HOST?.trim() || "127.0.0.1";
  const port = integer(process.env, "COMPANY_OS_REFERENCE_DATA_NODE_PORT", 4321, 1, 65_535);
  const server = await createReferenceDataNodeService();
  dropRuntimePrivileges();
  server.listen(port, host, () => process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    event: "company_os.reference_data_node_started",
    fixtureOnly: true,
  })}\n`));
  const shutdown = () => server.close(() => process.exit(0));
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
