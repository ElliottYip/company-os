import assert from "node:assert/strict";
import test from "node:test";
import { operationalLogLine } from "../adapters/http/structured-operational-log.ts";

test("operational logs use a stable bounded schema without customer coordinates", () => {
  const line = operationalLogLine({ event: "company_os.started", level: "INFO",
    deploymentProfile: "managed-cloud", exposure: "public", port: 4310 });
  assert.deepEqual(JSON.parse(line), { schemaVersion: 1, event: "company_os.started", level: "INFO",
    deploymentProfile: "managed-cloud", exposure: "public", port: 4310 });
  assert.doesNotMatch(line, /tenant|companyId|principal|workId|agentId|host|url|message|stack/i);
});

test("operational log serializer rejects invalid numeric coordinates", () => {
  assert.throws(() => operationalLogLine({ event: "company_os.started", level: "INFO",
    deploymentProfile: "self-hosted", exposure: "private", port: 0 }), /OPERATIONAL_LOG_PORT_INVALID/);
});
