import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const compatibilityRoot = join(root, "compatibility-tests");

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

const required = await json(join(compatibilityRoot, "paperclip-required-contract.json"));
const versions = await json(join(compatibilityRoot, "paperclip-versions.json"));
const errors = [];

function endpointKey(value) {
  return `${value.method} ${value.path}`;
}

async function checkVersion(label, version) {
  if (!version) return;
  const snapshotPath = join(compatibilityRoot, "snapshots", `${version.tag}.json`);
  let snapshot;
  try {
    snapshot = await json(snapshotPath);
  } catch {
    errors.push(`${label} snapshot missing: compatibility-tests/snapshots/${version.tag}.json`);
    return;
  }
  if (snapshot.tag !== version.tag || snapshot.commit !== version.commit) {
    errors.push(`${label} snapshot pin does not match paperclip-versions.json`);
  }
  if (snapshot.headless?.uiMode !== required.headless.uiMode ||
      snapshot.headless?.serveUi !== required.headless.serveUi) {
    errors.push(`${label} does not preserve the headless customer boundary`);
  }
  const available = new Set((snapshot.endpoints ?? []).map(endpointKey));
  for (const endpoint of required.requiredEndpoints) {
    if (!available.has(endpointKey(endpoint))) {
      errors.push(`${label} lacks required endpoint ${endpointKey(endpoint)}`);
    }
  }
  if (snapshot.durableRunEvents?.cursorField !== required.durableRunEvents.cursorField ||
      snapshot.durableRunEvents?.queryField !== required.durableRunEvents.queryField) {
    errors.push(`${label} changed the durable run-event cursor contract`);
  }
  if (snapshot.companyLiveEvents?.authority !== "cache-hint-only") {
    errors.push(`${label} incorrectly treats non-replayable company events as authority`);
  }
  const audit = snapshot.dependencyAudit;
  if (snapshot.admission?.productionApproved === true &&
      ((audit?.critical ?? 0) > 0 || (audit?.high ?? 0) > 0)) {
    errors.push(`${label} cannot be production-approved with critical/high audit findings`);
  }
}

await checkVersion("admitted", versions.admitted);
await checkVersion("candidate", versions.candidate);

if (errors.length) {
  console.error("Paperclip compatibility violations:\n");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const candidate = versions.candidate?.tag ?? "none";
  console.log(`Paperclip compatibility snapshots valid (admitted=${versions.admitted.tag}, candidate=${candidate}).`);
}
