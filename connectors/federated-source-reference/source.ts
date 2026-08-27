import type { AgentPortfolioRecord } from "../../core/agent-portfolio.ts";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { validateAgentPortfolioRecord } from "../../core/agent-portfolio.ts";
import type { ExternalWorkInput, ExternalWorkRecord } from "../../core/cross-source-work.ts";
import { validateExternalWork } from "../../core/cross-source-work.ts";
import type {
  CapabilityDeclarationV2,
  FederatedWorkSynchronization,
} from "../../connector-sdk/contracts.ts";

// Paperclip v2026.817.0 official APIs used by this adapter:
// https://github.com/paperclipai/paperclip/blob/v2026.817.0/docs/api/agents.md
// https://github.com/paperclipai/paperclip/blob/v2026.817.0/doc/SPEC-implementation.md#104-tasks-issues
const PAPERCLIP_SOURCE_VERSION = "v2026.817.0";
const MAXIMUM_RESPONSE_BYTES = 2 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PORTABLE_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;

interface PaperclipAgent {
  readonly id: string;
  readonly companyId: string;
  readonly name: string;
  readonly status: string;
  readonly updatedAt: string;
}

interface PaperclipIssue {
  readonly id: string;
  readonly companyId: string;
  readonly identifier?: string | null;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly assigneeAgentId?: string | null;
  readonly updatedAt: string;
}

export interface PaperclipFederatedSyncSnapshot {
  readonly sourceVersion: typeof PAPERCLIP_SOURCE_VERSION;
  readonly synchronizedAt: string;
  readonly inventory: readonly AgentPortfolioRecord[];
  readonly work: readonly FederatedWorkSynchronization[];
  readonly anomalies: readonly {
    readonly code: "EXTERNAL_AGENT_BINDING_MISSING" |
      "EXTERNAL_WORK_AGENT_BINDING_MISSING" |
      "EXTERNAL_AGENT_STATUS_UNSUPPORTED" |
      "EXTERNAL_WORK_STATUS_UNSUPPORTED";
    readonly externalId: string;
  }[];
}

export interface PaperclipAgentBinding {
  readonly externalAgentId: string;
  readonly agentId: string;
  readonly accountableHumanId: string;
}

interface PaperclipFederatedConnectorOptions {
  readonly baseUrl: string;
  readonly externalCompanyId: string;
  readonly companyId: string;
  readonly connectorId: string;
  readonly runtimeAgentId: string;
  readonly runtimeAccountableHumanId: string;
  readonly agentBindings: readonly PaperclipAgentBinding[];
  readonly synchronizedAt: () => string;
  readonly authorizationHeader: () => Promise<string>;
  readonly fetch?: typeof fetch;
}

export function parsePaperclipAgentBindings(value: string): readonly PaperclipAgentBinding[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("PAPERCLIP_AGENT_BINDINGS_INVALID");
  }
  if (!Array.isArray(parsed) || parsed.length > 200 || parsed.some((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return true;
    const record = item as Record<string, unknown>;
    return Object.keys(record).sort().join(",") !==
        "accountableHumanId,agentId,externalAgentId" ||
      typeof record.externalAgentId !== "string" || typeof record.agentId !== "string" ||
      typeof record.accountableHumanId !== "string";
  })) {
    throw new Error("PAPERCLIP_AGENT_BINDINGS_INVALID");
  }
  return parsed as unknown as readonly PaperclipAgentBinding[];
}

const AGENT_STATUS = new Map<string, AgentPortfolioRecord["lifecycleStatus"]>([
  ["pending_approval", "REQUESTED"],
  ["active", "ACTIVE"],
  ["idle", "ACTIVE"],
  ["running", "ACTIVE"],
  ["paused", "PAUSED"],
  ["terminated", "RETIRED"],
  ["error", "ERROR"],
]);

const WORK_STATUS = new Map<string, ExternalWorkInput["status"]>([
  ["backlog", "PENDING"],
  ["todo", "PENDING"],
  ["in_progress", "WORKING"],
  ["in_review", "WAITING"],
  ["blocked", "BLOCKED"],
  ["done", "COMPLETED"],
  ["cancelled", "CANCELLED"],
]);

function configuredId(value: string, code: string): string {
  const normalized = value.trim();
  if (!PORTABLE_ID.test(normalized)) throw new Error(code);
  return normalized;
}

function externalId(value: string, code: string): string {
  const normalized = value.trim();
  if (!UUID.test(normalized)) throw new Error(code);
  return normalized;
}

function instant(value: string, code: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error(code);
  return value;
}

function safeBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PAPERCLIP_BASE_URL_INVALID");
  }
  const loopback = url.protocol === "http:" && ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname);
  if ((url.protocol !== "https:" && !loopback) || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new Error("PAPERCLIP_BASE_URL_INVALID");
  }
  return url;
}

function sourceRevision(updatedAt: string): number {
  const value = Date.parse(updatedAt);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("PAPERCLIP_UPDATED_AT_INVALID");
  return value;
}

function resultReference(issueId: string): string {
  return `paperclip-result-${issueId}`;
}

function isAgent(value: unknown): value is PaperclipAgent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && UUID.test(record.id) &&
    typeof record.companyId === "string" && UUID.test(record.companyId) &&
    typeof record.name === "string" && record.name.trim().length > 0 &&
    typeof record.status === "string" && typeof record.updatedAt === "string" &&
    Number.isFinite(Date.parse(record.updatedAt));
}

function isIssue(value: unknown): value is PaperclipIssue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && UUID.test(record.id) &&
    typeof record.companyId === "string" && UUID.test(record.companyId) &&
    typeof record.title === "string" && record.title.trim().length > 0 &&
    typeof record.status === "string" && typeof record.priority === "string" &&
    (record.assigneeAgentId === null || record.assigneeAgentId === undefined ||
      (typeof record.assigneeAgentId === "string" && UUID.test(record.assigneeAgentId))) &&
    typeof record.updatedAt === "string" && Number.isFinite(Date.parse(record.updatedAt));
}

export function createPaperclipFederatedConnector(options: PaperclipFederatedConnectorOptions) {
  const baseUrl = safeBaseUrl(options.baseUrl);
  const externalCompanyId = externalId(options.externalCompanyId, "PAPERCLIP_COMPANY_ID_INVALID");
  const companyId = configuredId(options.companyId, "PAPERCLIP_ANC_COMPANY_ID_INVALID");
  const connectorId = configuredId(options.connectorId, "PAPERCLIP_CONNECTOR_ID_INVALID");
  const runtimeAgentId = configuredId(options.runtimeAgentId, "PAPERCLIP_RUNTIME_AGENT_ID_INVALID");
  const runtimeAccountableHumanId = configuredId(
    options.runtimeAccountableHumanId,
    "PAPERCLIP_ACCOUNTABLE_HUMAN_ID_INVALID",
  );
  const fetchImplementation = options.fetch ?? fetch;
  const bindings = new Map<string, PaperclipAgentBinding>();
  for (const binding of options.agentBindings) {
    const externalAgentId = externalId(binding.externalAgentId, "PAPERCLIP_AGENT_BINDING_INVALID");
    if (bindings.has(externalAgentId)) throw new Error("PAPERCLIP_AGENT_BINDING_DUPLICATE");
    bindings.set(externalAgentId, {
      externalAgentId,
      agentId: configuredId(binding.agentId, "PAPERCLIP_AGENT_BINDING_INVALID"),
      accountableHumanId: configuredId(
        binding.accountableHumanId,
        "PAPERCLIP_AGENT_BINDING_INVALID",
      ),
    });
  }

  async function request(path: string): Promise<unknown> {
    const authorization = await options.authorizationHeader();
    if (!/^Bearer [\x21-\x7e]{16,4096}$/.test(authorization)) {
      throw new Error("PAPERCLIP_AUTHORIZATION_INVALID");
    }
    const response = await fetchImplementation(new URL(path, baseUrl), {
      method: "GET",
      headers: { accept: "application/json", authorization },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`PAPERCLIP_HTTP_${response.status}`);
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAXIMUM_RESPONSE_BYTES) throw new Error("PAPERCLIP_RESPONSE_TOO_LARGE");
    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > MAXIMUM_RESPONSE_BYTES) {
      throw new Error("PAPERCLIP_RESPONSE_TOO_LARGE");
    }
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new Error("PAPERCLIP_RESPONSE_INVALID");
    }
  }

  function capabilityDeclaration(): CapabilityDeclarationV2 {
    return {
      connectorId,
      protocolVersion: "2.0",
      capabilities: {
        data: ["AGENT_INVENTORY", "FEDERATED_WORK", "RESULT_REFERENCES"],
        control: ["SYNCHRONIZE_FEDERATED_RECORDS"],
      },
      maximumBatchSize: 200,
    };
  }

  async function synchronize(): Promise<PaperclipFederatedSyncSnapshot> {
    const synchronizedAt = instant(options.synchronizedAt(), "PAPERCLIP_SYNCHRONIZED_AT_INVALID");
    const [agentValue, issueValue] = await Promise.all([
      request(`/api/companies/${externalCompanyId}/agents`),
      request(`/api/companies/${externalCompanyId}/issues?limit=200&offset=0&sortField=updated&sortDir=desc`),
    ]);
    if (!Array.isArray(agentValue) || !agentValue.every(isAgent) ||
        !Array.isArray(issueValue) || !issueValue.every(isIssue)) {
      throw new Error("PAPERCLIP_RESPONSE_INVALID");
    }

    const anomalies: PaperclipFederatedSyncSnapshot["anomalies"][number][] = [];
    const inventory: AgentPortfolioRecord[] = [validateAgentPortfolioRecord({
      id: runtimeAgentId,
      companyId,
      displayName: "Paperclip federated runtime",
      accountableHumanId: runtimeAccountableHumanId,
      providerReference: "paperclip",
      runtimeReference: "paperclip-v2026-817-0",
      source: {
        connectorId,
        externalId: `company:${externalCompanyId}`,
        externalUrl: baseUrl.protocol === "https:"
          ? new URL(`/api/companies/${externalCompanyId}`, baseUrl).toString()
          : null,
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
      privacyBoundary: "BOUNDED_SOURCE_RECORDS",
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
          externalUrl: baseUrl.protocol === "https:"
            ? new URL(`/api/agents/${agent.id}`, baseUrl).toString()
            : null,
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
        privacyBoundary: "BOUNDED_SOURCE_RECORDS",
      }));
    }

    const work: FederatedWorkSynchronization[] = [];
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
      const validatedRecord: ExternalWorkRecord = validateExternalWork({
        id: `paperclip-work-${issue.id}`,
        companyId,
        agentId: bindings.get(issue.assigneeAgentId)!.agentId,
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
          returnUrl: baseUrl.protocol === "https:"
            ? new URL(`/api/issues/${issue.id}`, baseUrl).toString()
            : null,
        },
        evidenceReferences: [],
        resultReference: status === "COMPLETED" ? resultReference(issue.id) : null,
        costCents: 0,
        sourceRevision: sourceRevision(issue.updatedAt),
        synchronizedAt: issue.updatedAt,
        provenance: "PRODUCTION",
      }, "FEDERATED");
      const { mode: _validatedMode, ...record } = validatedRecord;
      work.push({
        mode: "FEDERATED",
        idempotencyKey: `${connectorId}:${issue.id}:${validatedRecord.sourceRevision}`,
        record,
      });
    }

    return {
      sourceVersion: PAPERCLIP_SOURCE_VERSION,
      synchronizedAt,
      inventory,
      work,
      anomalies,
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
          anomalies: snapshot.anomalies,
        };
      },
    };
  }

  return { capabilityDeclaration, synchronize, portfolioSource };
}

function deploymentAuthorization(environment: NodeJS.ProcessEnv): string {
  if (environment.COMPANY_OS_PAPERCLIP_AUTHORIZATION?.trim()) {
    throw new Error("PAPERCLIP_AUTHORIZATION_FILE_REQUIRED");
  }
  const path = environment.COMPANY_OS_PAPERCLIP_AUTHORIZATION_FILE?.trim();
  if (!path || !isAbsolute(path) || path.includes("\0")) {
    throw new Error("PAPERCLIP_AUTHORIZATION_FILE_REQUIRED");
  }
  const metadata = statSync(path);
  if (!metadata.isFile() || metadata.size < 16 || metadata.size > 16_384) {
    throw new Error("PAPERCLIP_AUTHORIZATION_FILE_INVALID");
  }
  const value = readFileSync(path, "utf8").trim();
  if (value.length < 16 || value.length > 16_384 || /[\r\n]/.test(value)) {
    throw new Error("PAPERCLIP_AUTHORIZATION_FILE_INVALID");
  }
  return value;
}

/** Installed-package factory consumed by the provider-neutral API loader. */
export function createFederatedPortfolioSource(environment: NodeJS.ProcessEnv = process.env) {
  const authorization = deploymentAuthorization(environment);
  return createPaperclipFederatedConnector({
    baseUrl: environment.COMPANY_OS_PAPERCLIP_BASE_URL ?? "",
    externalCompanyId: environment.COMPANY_OS_PAPERCLIP_COMPANY_ID ?? "",
    companyId: environment.COMPANY_OS_PAPERCLIP_ANC_COMPANY_ID ?? "",
    connectorId: environment.COMPANY_OS_PAPERCLIP_CONNECTOR_ID ?? "",
    runtimeAgentId: environment.COMPANY_OS_PAPERCLIP_RUNTIME_AGENT_ID ?? "",
    runtimeAccountableHumanId: environment.COMPANY_OS_PAPERCLIP_ACCOUNTABLE_HUMAN_ID ?? "",
    agentBindings: parsePaperclipAgentBindings(
      environment.COMPANY_OS_PAPERCLIP_AGENT_BINDINGS ?? "",
    ),
    synchronizedAt: () => new Date().toISOString(),
    authorizationHeader: async () => `Bearer ${authorization}`,
  }).portfolioSource();
}
