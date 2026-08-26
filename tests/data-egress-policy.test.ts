import assert from "node:assert/strict";
import test from "node:test";

import { evaluateDataAccess } from "../core/data-governance.ts";

const contract = {
  id: "contract-market",
  companyId: "company-one",
  dataSourceId: "source-market",
  authorizedAgentIds: ["agent-one"],
  authorizedOperations: ["READ", "EXPORT"],
  allowedPurposes: ["market-research"],
  maximumClassification: "INTERNAL",
  allowedExportDestinations: ["company-brief-store"],
  validFrom: "2026-08-18T00:00:00.000Z",
  validUntil: "2026-08-19T00:00:00.000Z",
  status: "ACTIVE",
} as const;

test("data policy grants only an exact authorized scope", () => {
  assert.deepEqual(evaluateDataAccess(contract, {
    companyId: "company-one",
    workId: "work-one",
    agentId: "agent-one",
    dataSourceId: "source-market",
    operation: "EXPORT",
    purpose: "market-research",
    classification: "INTERNAL",
    destinationId: "company-brief-store",
    contentDigest: `sha256:${"a".repeat(64)}`,
    requestedAt: "2026-08-18T08:00:00.000Z",
  }), { type: "GRANTED", contractId: "contract-market" });
});

test("data egress is deny-by-default across tenant, purpose, classification, destination and digest", () => {
  const base = {
    companyId: "company-one",
    workId: "work-one",
    agentId: "agent-one",
    dataSourceId: "source-market",
    operation: "EXPORT" as const,
    purpose: "market-research",
    classification: "INTERNAL" as const,
    destinationId: "company-brief-store",
    contentDigest: `sha256:${"a".repeat(64)}`,
    requestedAt: "2026-08-18T08:00:00.000Z",
  };
  const cases = [
    { ...base, companyId: "company-two" },
    { ...base, purpose: "training" },
    { ...base, classification: "RESTRICTED" as const },
    { ...base, destinationId: "public-internet" },
    { ...base, contentDigest: "" },
    { ...base, contentDigest: "sha256:not-a-cryptographic-digest" },
  ];

  for (const request of cases) {
    const result = evaluateDataAccess(contract, request);
    assert.equal(result.type, "DENIED");
  }
});
