// connectors/federated-source-reference/source.ts
import { readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";

// core/agent-portfolio.ts
var AGENT_CLASSES = ["PERSONAL", "SHARED", "FEDERATED_RUNTIME"];
var AGENT_MANAGEMENT_DEPTHS = [
  "INVENTORY",
  "OBSERVED",
  "GOVERNED",
  "FEDERATED"
];
var AGENT_EXECUTION_OWNERS = [
  "HUMAN_ENDPOINT",
  "ANC_CONNECTOR",
  "EXTERNAL_PLATFORM"
];
var PORTABLE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
var EXTERNAL_ID = /^[\p{L}\p{N}._:/@#-]{1,240}$/u;
var values = (candidates) => new Set(candidates);
var AGENT_CLASS_SET = values(AGENT_CLASSES);
var MANAGEMENT_DEPTH_SET = values(AGENT_MANAGEMENT_DEPTHS);
var EXECUTION_OWNER_SET = values(AGENT_EXECUTION_OWNERS);
var LIFECYCLE_SET = values(["REQUESTED", "ACTIVE", "PAUSED", "RETIRED", "ERROR"]);
var HEALTH_SET = values(["HEALTHY", "DEGRADED", "UNAVAILABLE", "NOT_BOUND"]);
var VISIBILITY_SET = values(["NONE", "SUMMARY_AND_REFERENCES", "GOVERNED_RECORD"]);
var PRIVACY_SET = values([
  "PRIVATE_ACTIVITY_EXCLUDED",
  "BOUNDED_SOURCE_RECORDS",
  "GOVERNED_AUTHORITY_ONLY"
]);
function id(value, code) {
  const normalized = value.trim();
  if (!PORTABLE_ID.test(normalized)) throw new Error(code);
  return normalized;
}
function optionalId(value, code) {
  return value === null ? null : id(value, code);
}
function uniqueIds(candidates, code) {
  const normalized = candidates.map((candidate) => id(candidate, code));
  if (new Set(normalized).size !== normalized.length) throw new Error(code);
  return normalized;
}
function timestamp(value) {
  if (value !== null && !Number.isFinite(Date.parse(value))) {
    throw new Error("AGENT_PORTFOLIO_SYNCHRONIZED_AT_INVALID");
  }
  return value;
}
function externalUrl(value) {
  if (value === null) return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("AGENT_PORTFOLIO_EXTERNAL_URL_INVALID");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("AGENT_PORTFOLIO_EXTERNAL_URL_INVALID");
  }
  return parsed.toString();
}
function validateAgentPortfolioRecord(candidate) {
  if (!AGENT_CLASS_SET.has(candidate.agentClass)) throw new Error("AGENT_PORTFOLIO_CLASS_INVALID");
  if (!MANAGEMENT_DEPTH_SET.has(candidate.managementDepth)) {
    throw new Error("AGENT_PORTFOLIO_MANAGEMENT_DEPTH_INVALID");
  }
  if (!EXECUTION_OWNER_SET.has(candidate.executionOwner)) {
    throw new Error("AGENT_PORTFOLIO_EXECUTION_OWNER_INVALID");
  }
  if (!LIFECYCLE_SET.has(candidate.lifecycleStatus)) {
    throw new Error("AGENT_PORTFOLIO_LIFECYCLE_STATUS_INVALID");
  }
  if (!HEALTH_SET.has(candidate.connectorHealth)) {
    throw new Error("AGENT_PORTFOLIO_CONNECTOR_HEALTH_INVALID");
  }
  if (!VISIBILITY_SET.has(candidate.workVisibility)) {
    throw new Error("AGENT_PORTFOLIO_WORK_VISIBILITY_INVALID");
  }
  if (!PRIVACY_SET.has(candidate.privacyBoundary)) {
    throw new Error("AGENT_PORTFOLIO_PRIVACY_BOUNDARY_INVALID");
  }
  if (candidate.agentClass === "PERSONAL" && (candidate.managementDepth !== "INVENTORY" || candidate.executionOwner !== "HUMAN_ENDPOINT" || candidate.privacyBoundary !== "PRIVATE_ACTIVITY_EXCLUDED")) {
    throw new Error("AGENT_PORTFOLIO_PERSONAL_BOUNDARY_INVALID");
  }
  if (candidate.managementDepth === "INVENTORY" && candidate.workVisibility !== "NONE") {
    throw new Error("AGENT_PORTFOLIO_INVENTORY_VISIBILITY_INVALID");
  }
  if (candidate.managementDepth === "OBSERVED" && (candidate.workVisibility !== "SUMMARY_AND_REFERENCES" || candidate.privacyBoundary !== "BOUNDED_SOURCE_RECORDS" || candidate.executionOwner === "ANC_CONNECTOR")) {
    throw new Error("AGENT_PORTFOLIO_OBSERVED_BOUNDARY_INVALID");
  }
  if (candidate.managementDepth === "GOVERNED" && candidate.executionOwner !== "ANC_CONNECTOR") {
    throw new Error("AGENT_PORTFOLIO_GOVERNED_EXECUTION_OWNER_INVALID");
  }
  if (candidate.managementDepth === "GOVERNED" && (candidate.workVisibility !== "GOVERNED_RECORD" || candidate.privacyBoundary !== "GOVERNED_AUTHORITY_ONLY")) {
    throw new Error("AGENT_PORTFOLIO_GOVERNED_BOUNDARY_INVALID");
  }
  if (candidate.agentClass === "FEDERATED_RUNTIME" && candidate.executionOwner !== "EXTERNAL_PLATFORM") {
    throw new Error("AGENT_PORTFOLIO_FEDERATED_EXECUTION_OWNER_INVALID");
  }
  if (candidate.agentClass === "FEDERATED_RUNTIME" && (candidate.managementDepth !== "FEDERATED" || candidate.workVisibility !== "SUMMARY_AND_REFERENCES" || candidate.privacyBoundary !== "BOUNDED_SOURCE_RECORDS")) {
    throw new Error("AGENT_PORTFOLIO_FEDERATED_BOUNDARY_INVALID");
  }
  if (candidate.managementDepth === "FEDERATED" && candidate.agentClass !== "FEDERATED_RUNTIME") {
    throw new Error("AGENT_PORTFOLIO_FEDERATED_CLASS_INVALID");
  }
  const displayName = candidate.displayName.trim();
  if (!displayName || [...displayName].length > 120) {
    throw new Error("AGENT_PORTFOLIO_DISPLAY_NAME_INVALID");
  }
  const externalId2 = candidate.source.externalId?.trim() ?? null;
  if (externalId2 !== null && !EXTERNAL_ID.test(externalId2)) {
    throw new Error("AGENT_PORTFOLIO_EXTERNAL_ID_INVALID");
  }
  return {
    ...candidate,
    id: id(candidate.id, "AGENT_PORTFOLIO_ID_INVALID"),
    companyId: id(candidate.companyId, "AGENT_PORTFOLIO_COMPANY_ID_INVALID"),
    displayName,
    accountableHumanId: optionalId(
      candidate.accountableHumanId,
      "AGENT_PORTFOLIO_ACCOUNTABLE_HUMAN_ID_INVALID"
    ),
    providerReference: optionalId(
      candidate.providerReference,
      "AGENT_PORTFOLIO_PROVIDER_REFERENCE_INVALID"
    ),
    runtimeReference: optionalId(
      candidate.runtimeReference,
      "AGENT_PORTFOLIO_RUNTIME_REFERENCE_INVALID"
    ),
    source: {
      connectorId: optionalId(
        candidate.source.connectorId,
        "AGENT_PORTFOLIO_CONNECTOR_ID_INVALID"
      ),
      externalId: externalId2,
      externalUrl: externalUrl(candidate.source.externalUrl)
    },
    permissionIds: uniqueIds(
      candidate.permissionIds,
      "AGENT_PORTFOLIO_PERMISSION_IDS_INVALID"
    ),
    dataAuthorizationIds: uniqueIds(
      candidate.dataAuthorizationIds,
      "AGENT_PORTFOLIO_DATA_AUTHORIZATION_IDS_INVALID"
    ),
    synchronizedAt: timestamp(candidate.synchronizedAt)
  };
}

// core/cross-source-work.ts
var INPUT_KEYS = [
  "id",
  "companyId",
  "agentId",
  "initiatedBy",
  "title",
  "summary",
  "status",
  "source",
  "evidenceReferences",
  "resultReference",
  "costCents",
  "sourceRevision",
  "synchronizedAt",
  "provenance"
];
var SOURCE_KEYS = [
  "connectorId",
  "externalId",
  "channelReference",
  "threadReference",
  "workspaceReference",
  "returnUrl"
];
var PORTABLE_ID2 = /^[a-z0-9][a-z0-9-]{0,127}$/;
var REFERENCE = /^[\p{L}\p{N}._:/@#-]{1,240}$/u;
var STATUSES = /* @__PURE__ */ new Set([
  "PENDING",
  "WORKING",
  "WAITING",
  "BLOCKED",
  "AWAITING_APPROVAL",
  "COMPLETED",
  "FAILED",
  "CANCELLED"
]);
function exactKeys(value, expected, code) {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new Error(code);
  }
}
function id2(value, code) {
  const normalized = value.trim();
  if (!PORTABLE_ID2.test(normalized)) throw new Error(code);
  return normalized;
}
function optionalId2(value, code) {
  return value === null ? null : id2(value, code);
}
function reference(value, code) {
  if (value === null) return null;
  const normalized = value.trim();
  if (!REFERENCE.test(normalized)) throw new Error(code);
  return normalized;
}
function returnUrl(value) {
  if (value === null) return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("EXTERNAL_WORK_RETURN_URL_INVALID");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("EXTERNAL_WORK_RETURN_URL_INVALID");
  }
  return parsed.toString();
}
function validateExternalWork(input, mode) {
  exactKeys(input, INPUT_KEYS, "EXTERNAL_WORK_FIELDS_INVALID");
  if (!input.source || typeof input.source !== "object") {
    throw new Error("EXTERNAL_WORK_SOURCE_INVALID");
  }
  exactKeys(input.source, SOURCE_KEYS, "EXTERNAL_WORK_SOURCE_FIELDS_INVALID");
  const title = input.title.trim();
  const summary = input.summary.trim();
  if (!title || [...title].length > 120) throw new Error("EXTERNAL_WORK_TITLE_INVALID");
  if (!summary || [...summary].length > 2e3) throw new Error("EXTERNAL_WORK_SUMMARY_INVALID");
  if (!STATUSES.has(input.status)) throw new Error("EXTERNAL_WORK_STATUS_INVALID");
  if (!Number.isSafeInteger(input.costCents) || input.costCents < 0) {
    throw new Error("EXTERNAL_WORK_COST_INVALID");
  }
  if (!Number.isSafeInteger(input.sourceRevision) || input.sourceRevision < 1) {
    throw new Error("EXTERNAL_WORK_SOURCE_REVISION_INVALID");
  }
  if (!Number.isFinite(Date.parse(input.synchronizedAt))) {
    throw new Error("EXTERNAL_WORK_SYNCHRONIZED_AT_INVALID");
  }
  if (!["PRODUCTION", "DEMO_FIXTURE"].includes(input.provenance)) {
    throw new Error("EXTERNAL_WORK_PROVENANCE_INVALID");
  }
  if (input.status === "COMPLETED" && !input.resultReference) {
    throw new Error("EXTERNAL_WORK_RESULT_REQUIRED");
  }
  if (mode === "OBSERVED" && input.source.workspaceReference !== null) {
    throw new Error("OBSERVED_WORK_WORKSPACE_REFERENCE_INVALID");
  }
  if (mode === "FEDERATED" && input.source.workspaceReference === null) {
    throw new Error("FEDERATED_WORK_WORKSPACE_REFERENCE_REQUIRED");
  }
  const evidenceReferences = input.evidenceReferences.map(
    (item) => id2(item, "EXTERNAL_WORK_EVIDENCE_REFERENCES_INVALID")
  );
  if (new Set(evidenceReferences).size !== evidenceReferences.length) {
    throw new Error("EXTERNAL_WORK_EVIDENCE_REFERENCES_INVALID");
  }
  return {
    ...input,
    id: id2(input.id, "EXTERNAL_WORK_ID_INVALID"),
    companyId: id2(input.companyId, "EXTERNAL_WORK_COMPANY_ID_INVALID"),
    agentId: id2(input.agentId, "EXTERNAL_WORK_AGENT_ID_INVALID"),
    initiatedBy: optionalId2(input.initiatedBy, "EXTERNAL_WORK_INITIATOR_INVALID"),
    title,
    summary,
    source: {
      connectorId: id2(input.source.connectorId, "EXTERNAL_WORK_CONNECTOR_ID_INVALID"),
      externalId: reference(input.source.externalId, "EXTERNAL_WORK_EXTERNAL_ID_INVALID"),
      channelReference: reference(
        input.source.channelReference,
        "EXTERNAL_WORK_CHANNEL_REFERENCE_INVALID"
      ),
      threadReference: reference(
        input.source.threadReference,
        "EXTERNAL_WORK_THREAD_REFERENCE_INVALID"
      ),
      workspaceReference: reference(
        input.source.workspaceReference,
        "EXTERNAL_WORK_WORKSPACE_REFERENCE_INVALID"
      ),
      returnUrl: returnUrl(input.source.returnUrl)
    },
    evidenceReferences,
    resultReference: optionalId2(
      input.resultReference,
      "EXTERNAL_WORK_RESULT_REFERENCE_INVALID"
    ),
    mode
  };
}

// connectors/federated-source-reference/source.ts
var PAPERCLIP_SOURCE_VERSION = "v2026.817.0";
var MAXIMUM_RESPONSE_BYTES = 2 * 1024 * 1024;
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var PORTABLE_ID3 = /^[a-z0-9][a-z0-9-]{0,127}$/;
function parsePaperclipAgentBindings(value) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("PAPERCLIP_AGENT_BINDINGS_INVALID");
  }
  if (!Array.isArray(parsed) || parsed.length > 200 || parsed.some((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return true;
    const record = item;
    return Object.keys(record).sort().join(",") !== "accountableHumanId,agentId,externalAgentId" || typeof record.externalAgentId !== "string" || typeof record.agentId !== "string" || typeof record.accountableHumanId !== "string";
  })) {
    throw new Error("PAPERCLIP_AGENT_BINDINGS_INVALID");
  }
  return parsed;
}
var AGENT_STATUS = /* @__PURE__ */ new Map([
  ["pending_approval", "REQUESTED"],
  ["active", "ACTIVE"],
  ["idle", "ACTIVE"],
  ["running", "ACTIVE"],
  ["paused", "PAUSED"],
  ["terminated", "RETIRED"],
  ["error", "ERROR"]
]);
var WORK_STATUS = /* @__PURE__ */ new Map([
  ["backlog", "PENDING"],
  ["todo", "PENDING"],
  ["in_progress", "WORKING"],
  ["in_review", "WAITING"],
  ["blocked", "BLOCKED"],
  ["done", "COMPLETED"],
  ["cancelled", "CANCELLED"]
]);
function configuredId(value, code) {
  const normalized = value.trim();
  if (!PORTABLE_ID3.test(normalized)) throw new Error(code);
  return normalized;
}
function externalId(value, code) {
  const normalized = value.trim();
  if (!UUID.test(normalized)) throw new Error(code);
  return normalized;
}
function instant(value, code) {
  if (!Number.isFinite(Date.parse(value))) throw new Error(code);
  return value;
}
function safeBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PAPERCLIP_BASE_URL_INVALID");
  }
  const loopback = url.protocol === "http:" && ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname);
  if (url.protocol !== "https:" && !loopback || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("PAPERCLIP_BASE_URL_INVALID");
  }
  return url;
}
function sourceRevision(updatedAt) {
  const value = Date.parse(updatedAt);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("PAPERCLIP_UPDATED_AT_INVALID");
  return value;
}
function resultReference(issueId) {
  return `paperclip-result-${issueId}`;
}
function isAgent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value;
  return typeof record.id === "string" && UUID.test(record.id) && typeof record.companyId === "string" && UUID.test(record.companyId) && typeof record.name === "string" && record.name.trim().length > 0 && typeof record.status === "string" && typeof record.updatedAt === "string" && Number.isFinite(Date.parse(record.updatedAt));
}
function isIssue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value;
  return typeof record.id === "string" && UUID.test(record.id) && typeof record.companyId === "string" && UUID.test(record.companyId) && typeof record.title === "string" && record.title.trim().length > 0 && typeof record.status === "string" && typeof record.priority === "string" && (record.assigneeAgentId === null || record.assigneeAgentId === void 0 || typeof record.assigneeAgentId === "string" && UUID.test(record.assigneeAgentId)) && typeof record.updatedAt === "string" && Number.isFinite(Date.parse(record.updatedAt));
}
function createPaperclipFederatedConnector(options) {
  const baseUrl = safeBaseUrl(options.baseUrl);
  const externalCompanyId = externalId(options.externalCompanyId, "PAPERCLIP_COMPANY_ID_INVALID");
  const companyId = configuredId(options.companyId, "PAPERCLIP_ANC_COMPANY_ID_INVALID");
  const connectorId = configuredId(options.connectorId, "PAPERCLIP_CONNECTOR_ID_INVALID");
  const runtimeAgentId = configuredId(options.runtimeAgentId, "PAPERCLIP_RUNTIME_AGENT_ID_INVALID");
  const runtimeAccountableHumanId = configuredId(
    options.runtimeAccountableHumanId,
    "PAPERCLIP_ACCOUNTABLE_HUMAN_ID_INVALID"
  );
  const fetchImplementation = options.fetch ?? fetch;
  const bindings = /* @__PURE__ */ new Map();
  for (const binding of options.agentBindings) {
    const externalAgentId = externalId(binding.externalAgentId, "PAPERCLIP_AGENT_BINDING_INVALID");
    if (bindings.has(externalAgentId)) throw new Error("PAPERCLIP_AGENT_BINDING_DUPLICATE");
    bindings.set(externalAgentId, {
      externalAgentId,
      agentId: configuredId(binding.agentId, "PAPERCLIP_AGENT_BINDING_INVALID"),
      accountableHumanId: configuredId(
        binding.accountableHumanId,
        "PAPERCLIP_AGENT_BINDING_INVALID"
      )
    });
  }
  async function request(path) {
    const authorization = await options.authorizationHeader();
    if (!/^Bearer [\x21-\x7e]{16,4096}$/.test(authorization)) {
      throw new Error("PAPERCLIP_AUTHORIZATION_INVALID");
    }
    const response = await fetchImplementation(new URL(path, baseUrl), {
      method: "GET",
      headers: { accept: "application/json", authorization },
      redirect: "error",
      signal: AbortSignal.timeout(1e4)
    });
    if (!response.ok) throw new Error(`PAPERCLIP_HTTP_${response.status}`);
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAXIMUM_RESPONSE_BYTES) throw new Error("PAPERCLIP_RESPONSE_TOO_LARGE");
    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > MAXIMUM_RESPONSE_BYTES) {
      throw new Error("PAPERCLIP_RESPONSE_TOO_LARGE");
    }
    try {
      return JSON.parse(body);
    } catch {
      throw new Error("PAPERCLIP_RESPONSE_INVALID");
    }
  }
  function capabilityDeclaration() {
    return {
      connectorId,
      protocolVersion: "2.0",
      capabilities: {
        data: ["AGENT_INVENTORY", "FEDERATED_WORK", "RESULT_REFERENCES"],
        control: ["SYNCHRONIZE_FEDERATED_RECORDS"]
      },
      maximumBatchSize: 200
    };
  }
  async function synchronize() {
    const synchronizedAt = instant(options.synchronizedAt(), "PAPERCLIP_SYNCHRONIZED_AT_INVALID");
    const [agentValue, issueValue] = await Promise.all([
      request(`/api/companies/${externalCompanyId}/agents`),
      request(`/api/companies/${externalCompanyId}/issues?limit=200&offset=0&sortField=updated&sortDir=desc`)
    ]);
    if (!Array.isArray(agentValue) || !agentValue.every(isAgent) || !Array.isArray(issueValue) || !issueValue.every(isIssue)) {
      throw new Error("PAPERCLIP_RESPONSE_INVALID");
    }
    const anomalies = [];
    const inventory = [validateAgentPortfolioRecord({
      id: runtimeAgentId,
      companyId,
      displayName: "Paperclip federated runtime",
      accountableHumanId: runtimeAccountableHumanId,
      providerReference: "paperclip",
      runtimeReference: "paperclip-v2026-817-0",
      source: {
        connectorId,
        externalId: `company:${externalCompanyId}`,
        externalUrl: baseUrl.protocol === "https:" ? new URL(`/api/companies/${externalCompanyId}`, baseUrl).toString() : null
      },
      permissionIds: [],
      dataAuthorizationIds: [],
      lifecycleStatus: "ACTIVE",
      connectorHealth: "HEALTHY",
      synchronizedAt,
      agentClass: "FEDERATED_RUNTIME",
      managementDepth: "FEDERATED",
      executionOwner: "EXTERNAL_PLATFORM",
      workVisibility: "SUMMARY_AND_REFERENCES",
      privacyBoundary: "BOUNDED_SOURCE_RECORDS"
    })];
    for (const agent of agentValue) {
      if (agent.companyId !== externalCompanyId) throw new Error("PAPERCLIP_TENANT_MISMATCH");
      const binding = bindings.get(agent.id);
      if (!binding) {
        anomalies.push({ code: "EXTERNAL_AGENT_BINDING_MISSING", externalId: agent.id });
        continue;
      }
      const lifecycleStatus = AGENT_STATUS.get(agent.status);
      if (!lifecycleStatus) {
        anomalies.push({ code: "EXTERNAL_AGENT_STATUS_UNSUPPORTED", externalId: agent.id });
        continue;
      }
      inventory.push(validateAgentPortfolioRecord({
        id: binding.agentId,
        companyId,
        displayName: agent.name,
        accountableHumanId: binding.accountableHumanId,
        providerReference: "paperclip",
        runtimeReference: "paperclip-v2026-817-0",
        source: {
          connectorId,
          externalId: `agent:${agent.id}`,
          externalUrl: baseUrl.protocol === "https:" ? new URL(`/api/agents/${agent.id}`, baseUrl).toString() : null
        },
        permissionIds: [],
        dataAuthorizationIds: [],
        lifecycleStatus,
        connectorHealth: "HEALTHY",
        synchronizedAt: agent.updatedAt,
        agentClass: "SHARED",
        managementDepth: "OBSERVED",
        executionOwner: "EXTERNAL_PLATFORM",
        workVisibility: "SUMMARY_AND_REFERENCES",
        privacyBoundary: "BOUNDED_SOURCE_RECORDS"
      }));
    }
    const work = [];
    for (const issue of issueValue) {
      if (issue.companyId !== externalCompanyId) throw new Error("PAPERCLIP_TENANT_MISMATCH");
      if (!issue.assigneeAgentId || !bindings.has(issue.assigneeAgentId)) {
        anomalies.push({ code: "EXTERNAL_WORK_AGENT_BINDING_MISSING", externalId: issue.id });
        continue;
      }
      const status = WORK_STATUS.get(issue.status);
      if (!status) {
        anomalies.push({ code: "EXTERNAL_WORK_STATUS_UNSUPPORTED", externalId: issue.id });
        continue;
      }
      const validatedRecord = validateExternalWork({
        id: `paperclip-work-${issue.id}`,
        companyId,
        agentId: bindings.get(issue.assigneeAgentId).agentId,
        initiatedBy: null,
        title: issue.title,
        summary: `External issue status: ${issue.status}; priority: ${issue.priority}.`,
        status,
        source: {
          connectorId,
          externalId: `issue:${issue.id}`,
          channelReference: null,
          threadReference: null,
          workspaceReference: `company:${externalCompanyId}`,
          returnUrl: baseUrl.protocol === "https:" ? new URL(`/api/issues/${issue.id}`, baseUrl).toString() : null
        },
        evidenceReferences: [],
        resultReference: status === "COMPLETED" ? resultReference(issue.id) : null,
        costCents: 0,
        sourceRevision: sourceRevision(issue.updatedAt),
        synchronizedAt: issue.updatedAt,
        provenance: "PRODUCTION"
      }, "FEDERATED");
      const { mode: _validatedMode, ...record } = validatedRecord;
      work.push({
        mode: "FEDERATED",
        idempotencyKey: `${connectorId}:${issue.id}:${validatedRecord.sourceRevision}`,
        record
      });
    }
    return {
      sourceVersion: PAPERCLIP_SOURCE_VERSION,
      synchronizedAt,
      inventory,
      work,
      anomalies
    };
  }
  function portfolioSource() {
    return {
      connectorId,
      companyId,
      async synchronize() {
        const snapshot = await synchronize();
        return {
          inventory: snapshot.inventory,
          work: snapshot.work.map(({ record }) => record),
          anomalies: snapshot.anomalies
        };
      }
    };
  }
  return { capabilityDeclaration, synchronize, portfolioSource };
}
function deploymentAuthorization(environment) {
  if (environment.COMPANY_OS_PAPERCLIP_AUTHORIZATION?.trim()) {
    throw new Error("PAPERCLIP_AUTHORIZATION_FILE_REQUIRED");
  }
  const path = environment.COMPANY_OS_PAPERCLIP_AUTHORIZATION_FILE?.trim();
  if (!path || !isAbsolute(path) || path.includes("\0")) {
    throw new Error("PAPERCLIP_AUTHORIZATION_FILE_REQUIRED");
  }
  const metadata = statSync(path);
  if (!metadata.isFile() || metadata.size < 16 || metadata.size > 16384) {
    throw new Error("PAPERCLIP_AUTHORIZATION_FILE_INVALID");
  }
  const value = readFileSync(path, "utf8").trim();
  if (value.length < 16 || value.length > 16384 || /[\r\n]/.test(value)) {
    throw new Error("PAPERCLIP_AUTHORIZATION_FILE_INVALID");
  }
  return value;
}
function createFederatedPortfolioSource(environment = process.env) {
  const authorization = deploymentAuthorization(environment);
  return createPaperclipFederatedConnector({
    baseUrl: environment.COMPANY_OS_PAPERCLIP_BASE_URL ?? "",
    externalCompanyId: environment.COMPANY_OS_PAPERCLIP_COMPANY_ID ?? "",
    companyId: environment.COMPANY_OS_PAPERCLIP_ANC_COMPANY_ID ?? "",
    connectorId: environment.COMPANY_OS_PAPERCLIP_CONNECTOR_ID ?? "",
    runtimeAgentId: environment.COMPANY_OS_PAPERCLIP_RUNTIME_AGENT_ID ?? "",
    runtimeAccountableHumanId: environment.COMPANY_OS_PAPERCLIP_ACCOUNTABLE_HUMAN_ID ?? "",
    agentBindings: parsePaperclipAgentBindings(
      environment.COMPANY_OS_PAPERCLIP_AGENT_BINDINGS ?? ""
    ),
    synchronizedAt: () => (/* @__PURE__ */ new Date()).toISOString(),
    authorizationHeader: async () => `Bearer ${authorization}`
  }).portfolioSource();
}
export {
  createFederatedPortfolioSource,
  createPaperclipFederatedConnector,
  parsePaperclipAgentBindings
};
