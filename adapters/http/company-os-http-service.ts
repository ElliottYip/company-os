import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { CompanyWorkState } from "../../application/company-operations.ts";
import type { OrganizationDraft } from "../../core/organization.ts";
import { BoundedHttpMetrics } from "./bounded-http-metrics.ts";

export interface DemoApplicationClient {
  snapshot(): Promise<CompanyWorkState>;
  assignTask(): Promise<CompanyWorkState>;
  advance(): Promise<CompanyWorkState>;
  decide(decision: "APPROVED" | "REJECTED"): Promise<CompanyWorkState>;
  reset(): Promise<CompanyWorkState>;
}

export interface CompanyOsHttpServiceOptions {
  readonly runtime: DemoApplicationClient;
  readonly deploymentProfile: "managed-cloud" | "self-hosted";
  readonly serviceMode?: "DEMO_FIXTURE" | "LOCAL_DEVELOPMENT" | "FORMAL";
  readonly deploymentExposure?: "private" | "public";
  readonly allowedOrigins?: readonly string[];
  readonly maxBodyBytes?: number;
  readonly maxPortabilityBytes?: number;
  readonly metricsEnabled?: boolean;
  readonly metrics?: BoundedHttpMetrics;
  readonly formalAccess?: {
    getStatus(request: IncomingMessage): Promise<unknown>;
  };
  readonly operationalReadiness?: {
    getStatus(): Promise<{
      readonly status: "ready" | "not_ready";
      readonly checks: Readonly<Record<string, {
        readonly status: "pass" | "degraded" | "fail";
        readonly code: string;
      }>>;
    }>;
  };
  readonly formalDirectory?: {
    listCompanies(request: IncomingMessage): Promise<unknown>;
    claimFirstAdmin?(request: IncomingMessage): Promise<unknown>;
    createCompany?(request: IncomingMessage, input: unknown): Promise<unknown>;
    inspectCompanyRestore?(request: IncomingMessage, input: unknown): Promise<unknown>;
    restoreCompany?(request: IncomingMessage, input: unknown): Promise<unknown>;
    setupOrganization?(request: IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    reviseOrganization?(request: IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    updateCompanyProfile?(request: IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    archiveCompany?(request: IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    archiveDepartment?(request: IncomingMessage, companyId: string, departmentId: string, input: unknown): Promise<unknown>;
    createHumanInvite?(request: IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    acceptHumanInvite?(request: IncomingMessage, token: string): Promise<unknown>;
    listHumanMembers?(request: IncomingMessage, companyId: string): Promise<unknown>;
    updateHumanMember?(request: IncomingMessage, companyId: string, userId: string, input: unknown): Promise<unknown>;
  };
  readonly authHandler?: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  readonly formalApi?: {
    getAgentBoss(request: IncomingMessage, companyId: string): Promise<unknown>;
    getAdministration?(request: IncomingMessage, companyId: string): Promise<unknown>;
    getPlanning?(request: IncomingMessage, companyId: string): Promise<unknown>;
    replacePlanning?(request: IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    createGoal?(request: IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    updateGoal?(request: IncomingMessage, companyId: string, goalId: string, input: unknown): Promise<unknown>;
    createProject?(request: IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    updateProject?(request: IncomingMessage, companyId: string, projectId: string, input: unknown): Promise<unknown>;
    archiveProject?(request: IncomingMessage, companyId: string, projectId: string, input: unknown): Promise<unknown>;
    dispatchWork?(request: IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    listWork?(request: IncomingMessage, companyId: string, input: { cursor: number; limit: number }): Promise<unknown>;
    getWork?(request: IncomingMessage, companyId: string, workId: string): Promise<unknown>;
    getWorkRunTimeline?(request: IncomingMessage, companyId: string, workId: string, attemptId: string,
      input: { afterSequence: number; limit: number }): Promise<unknown>;
    getCompanyActivity?(request: IncomingMessage, companyId: string,
      input: { afterSequence: number; limit: number }): Promise<unknown>;
    getAccountabilityLedger?(request: IncomingMessage, companyId: string): Promise<unknown>;
    exportAccountability?(request: IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    requestWorkCancellation?(request: IncomingMessage, companyId: string, workId: string, attemptId: string): Promise<unknown>;
    reconcileWorkAttempt?(request: IncomingMessage, companyId: string, workId: string, attemptId: string, input: unknown): Promise<unknown>;
    retryWorkAttempt?(request: IncomingMessage, companyId: string, workId: string, attemptId: string): Promise<unknown>;
    retryWorkExecutionPreparation?(request: IncomingMessage, companyId: string, workId: string,
      attemptId: string): Promise<unknown>;
    decideApproval?(request: IncomingMessage, companyId: string, requestId: string, input: unknown): Promise<unknown>;
    registerConnectorRuntime?(request: IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    setConnectorStatus?(request: IncomingMessage, companyId: string, connectorId: string, input: unknown): Promise<unknown>;
    createDataAuthorizationContract?(request: IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    setDataAuthorizationStatus?(request: IncomingMessage, companyId: string, contractId: string, input: unknown): Promise<unknown>;
    createModelRoute?(request: IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    setModelRouteEnabled?(request: IncomingMessage, companyId: string, routeId: string, input: unknown): Promise<unknown>;
    createToolProfile?(request: IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    bindToolProfile?(request: IncomingMessage, companyId: string, profileId: string, input: unknown): Promise<unknown>;
    createToolPolicy?(request: IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    setToolProfileStatus?(request: IncomingMessage, companyId: string, profileId: string, input: unknown): Promise<unknown>;
    upsertBudgetPolicy?(request: IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    replaceConnectorCatalog?(request: IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    replaceGovernanceCatalog?(request: IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    replaceResponsibilityContracts?(request: IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    transitionAgentLifecycle?(request: IncomingMessage, companyId: string, agentId: string, input: unknown): Promise<unknown>;
    transferResponsibility?(request: IncomingMessage, companyId: string, agentId: string, input: unknown): Promise<unknown>;
    exportCompany?(request: IncomingMessage, companyId: string): Promise<unknown>;
    beginSecretReferenceManagement?(request: IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    confirmSecretReferenceManagement?(request: IncomingMessage, companyId: string, sessionId: string): Promise<unknown>;
  };
}

const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const;

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const encoded = JSON.stringify(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(encoded),
  });
  res.end(encoded);
}

function sendError(res: ServerResponse, status: number, code: string, message: string) {
  sendJson(res, status, { error: { code, message } });
}

function sendStructuredError(
  res: ServerResponse,
  status: number,
  code: string,
  parameters: Readonly<Record<string, string | number | boolean | null>> = {},
) {
  sendJson(res, status, { error: { code, parameters } });
}

function sendMetrics(res: ServerResponse, body: string) {
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "content-type": "text/plain; version=0.0.4; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function readJson(req: IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxBodyBytes) throw new Error("REQUEST_BODY_TOO_LARGE");
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("INVALID_JSON");
  }
}

function isAllowedOrigin(req: IncomingMessage, allowedOrigins: readonly string[]) {
  const origin = req.headers.origin;
  return origin === undefined || allowedOrigins.includes(origin);
}

function actionFromBody(value: unknown):
  | { readonly action: "ASSIGN" | "ADVANCE" | "RESET" }
  | { readonly action: "DECIDE"; readonly decision: "APPROVED" | "REJECTED" }
  | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.action === "ASSIGN" || input.action === "ADVANCE" || input.action === "RESET") {
    return { action: input.action };
  }
  if (input.action === "DECIDE" && (input.decision === "APPROVED" || input.decision === "REJECTED")) {
    return { action: "DECIDE", decision: input.decision };
  }
  return null;
}

const PORTABLE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

function optionalId(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" && PORTABLE_ID.test(value) ? value : undefined;
}

function requiredId(value: unknown): string | undefined {
  return typeof value === "string" && PORTABLE_ID.test(value) ? value : undefined;
}

function accountabilityExportCommand(value: unknown): {
  readonly requestId: string;
  readonly purposeCode: "AUDIT_REVIEW" | "INCIDENT_REVIEW" | "CUSTOMER_PORTABILITY";
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const requestId = requiredId(input.requestId);
  if (!requestId || !["AUDIT_REVIEW", "INCIDENT_REVIEW", "CUSTOMER_PORTABILITY"]
    .includes(String(input.purposeCode)) || Object.keys(input).some((key) =>
      !["requestId", "purposeCode"].includes(key))) return null;
  return { requestId, purposeCode: input.purposeCode as
    "AUDIT_REVIEW" | "INCIDENT_REVIEW" | "CUSTOMER_PORTABILITY" };
}

function formalExecutionPreparation(value: unknown, companyId: string): unknown | null {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.dataAccess) || input.dataAccess.length > 32 ||
      !Array.isArray(input.secretLeases) || input.secretLeases.length > 16 ||
      Object.keys(input).some((key) => !["dataAccess", "secretLeases", "modelRouting"].includes(key))) return null;
  const dataAccess = input.dataAccess.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const item = value as Record<string, unknown>;
    const requestId = requiredId(item.requestId);
    const contractId = requiredId(item.contractId);
    const dataSourceId = requiredId(item.dataSourceId);
    const destinationId = optionalId(item.destinationId);
    if (!requestId || !contractId || !dataSourceId || destinationId === undefined ||
        !["READ", "WRITE", "EXPORT"].includes(String(item.operation)) ||
        !["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"].includes(String(item.classification)) ||
        typeof item.purpose !== "string" || !item.purpose.trim() || item.purpose.length > 256 ||
        !(item.contentDigest === null ||
          (typeof item.contentDigest === "string" && /^sha256:[a-z0-9-]{8,128}$/.test(item.contentDigest))) ||
        Object.keys(item).some((key) => ![
          "requestId", "contractId", "dataSourceId", "operation", "purpose", "classification",
          "destinationId", "contentDigest",
        ].includes(key))) return null;
    return { requestId, contractId, dataSourceId, operation: item.operation, purpose: item.purpose,
      classification: item.classification, destinationId, contentDigest: item.contentDigest };
  });
  const secretLeases = input.secretLeases.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const item = value as Record<string, unknown>;
    const secretReferenceId = requiredId(item.secretReferenceId);
    if (!secretReferenceId || typeof item.expectedVersion !== "number" ||
        !Number.isSafeInteger(item.expectedVersion) || item.expectedVersion < 1 ||
        typeof item.reasonCode !== "string" || !/^[A-Z][A-Z0-9_]{2,63}$/.test(item.reasonCode) ||
        typeof item.leaseDurationSeconds !== "number" || !Number.isSafeInteger(item.leaseDurationSeconds) ||
        item.leaseDurationSeconds < 30 || item.leaseDurationSeconds > 900 || Object.keys(item).some((key) => ![
          "secretReferenceId", "expectedVersion", "reasonCode", "leaseDurationSeconds",
        ].includes(key))) return null;
    return { secretReferenceId, expectedVersion: item.expectedVersion, reasonCode: item.reasonCode,
      leaseDurationSeconds: item.leaseDurationSeconds };
  });
  if (dataAccess.some((item) => !item) || secretLeases.some((item) => !item)) return null;
  let modelRouting: Record<string, unknown> | null | undefined;
  if (input.modelRouting === undefined || input.modelRouting === null) {
    modelRouting = input.modelRouting;
  } else if (typeof input.modelRouting === "object" && !Array.isArray(input.modelRouting)) {
    const item = input.modelRouting as Record<string, unknown>;
    const policyId = requiredId(item.policyId);
    if (item.companyId !== companyId || !policyId ||
        !["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"].includes(String(item.classification)) ||
        !["MANAGED_CLOUD", "LOCAL"].includes(String(item.requiredResidency)) ||
        Object.keys(item).some((key) => ![
          "companyId", "policyId", "classification", "requiredResidency",
        ].includes(key))) return null;
    modelRouting = { companyId, policyId, classification: item.classification,
      requiredResidency: item.requiredResidency };
  } else return null;
  return { dataAccess, secretLeases,
    ...(modelRouting === undefined ? {} : { modelRouting }) };
}

function formalWorkCommand(value: unknown, companyId: string): unknown | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!input.draft || typeof input.draft !== "object" || Array.isArray(input.draft)) return null;
  const draft = input.draft as Record<string, unknown>;
  const id = requiredId(draft.id);
  const departmentId = requiredId(draft.departmentId);
  const agentId = requiredId(draft.agentId);
  const requestedBy = requiredId(draft.requestedBy);
  const projectId = optionalId(draft.projectId);
  const parentWorkId = optionalId(draft.parentWorkId);
  const genericGoalId = optionalId(input.genericGoalId);
  const executionPreparation = formalExecutionPreparation(input.executionPreparation, companyId);
  const scope = draft.scope;
  if (!id || !departmentId || !agentId || !requestedBy || projectId === undefined ||
      parentWorkId === undefined || genericGoalId === undefined || executionPreparation === null ||
      typeof draft.title !== "string" || !draft.title.trim() || draft.title.length > 120 ||
      typeof draft.goal !== "string" || !draft.goal.trim() || draft.goal.length > 10_000 ||
      !["agent", "department", "project", "AGENT", "DEPARTMENT", "PROJECT"].includes(String(scope)) ||
      !Array.isArray(draft.actionIds) || !draft.actionIds.length ||
      !draft.actionIds.every((actionId) => requiredId(actionId))) return null;
  return {
    draft: {
      id,
      companyId,
      title: draft.title,
      goal: draft.goal,
      scope,
      departmentId,
      projectId,
      agentId,
      requestedBy,
      actionIds: [...draft.actionIds],
      parentWorkId,
    },
    genericGoalId,
    ...(executionPreparation === undefined ? {} : { executionPreparation }),
  };
}

function formalApprovalCommand(value: unknown): unknown | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const binding = input.expectedBinding;
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) return null;
  const candidate = binding as Record<string, unknown>;
  const action = candidate.action;
  if (!action || typeof action !== "object" || Array.isArray(action)) return null;
  const exactAction = action as Record<string, unknown>;
  if (!(input.decision === "APPROVED" || input.decision === "REJECTED") ||
      !requiredId(exactAction.id) || typeof exactAction.type !== "string" || !exactAction.type ||
      typeof exactAction.description !== "string" || !exactAction.description ||
      typeof exactAction.inputDigest !== "string" || !exactAction.inputDigest ||
      !["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(String(exactAction.risk)) ||
      !requiredId(candidate.workId) || !requiredId(candidate.responsibilityContractId) ||
      !requiredId(candidate.executingAgentId) || !requiredId(candidate.accountableHumanId) ||
      !Array.isArray(candidate.evidenceReferences) ||
      !candidate.evidenceReferences.every((reference) => requiredId(reference)) ||
      optionalId(candidate.resultReference) === undefined ||
      (input.note !== undefined && (typeof input.note !== "string" || input.note.length > 2_000))) {
    return null;
  }
  return {
    decision: input.decision,
    expectedBinding: structuredClone(binding),
    ...(typeof input.note === "string" ? { note: input.note } : {}),
  };
}

function createCompanyCommand(value: unknown): {
  readonly name: string;
  readonly purpose: string;
  readonly locale: string;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.name !== "string" || !input.name.trim() || [...input.name.trim()].length > 120 ||
      typeof input.purpose !== "string" || !input.purpose.trim() || [...input.purpose.trim()].length > 2_000 ||
      typeof input.locale !== "string" || !/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(input.locale)) return null;
  return { name: input.name, purpose: input.purpose, locale: input.locale };
}

function restoreCompanyCommand(value: unknown): { readonly backup: Record<string, unknown> } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || !input.backup || typeof input.backup !== "object" ||
      Array.isArray(input.backup)) return null;
  return { backup: input.backup as Record<string, unknown> };
}

function setupOrganizationCommand(value: unknown): {
  readonly departmentName: string;
  readonly ownerTitle: string;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.departmentName !== "string" || !input.departmentName.trim() ||
      [...input.departmentName.trim()].length > 120 ||
      typeof input.ownerTitle !== "string" || !input.ownerTitle.trim() ||
      [...input.ownerTitle.trim()].length > 120) return null;
  return { departmentName: input.departmentName, ownerTitle: input.ownerTitle };
}

function reviseOrganizationCommand(value: unknown): { readonly organization: OrganizationDraft } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const organization = (value as Record<string, unknown>).organization;
  if (!organization || typeof organization !== "object" || Array.isArray(organization)) return null;
  const candidate = organization as Record<string, unknown>;
  if (!candidate.company || typeof candidate.company !== "object" || Array.isArray(candidate.company) ||
      !Array.isArray(candidate.departments) || !Array.isArray(candidate.humans) || !Array.isArray(candidate.agents)) {
    return null;
  }
  return { organization: structuredClone(organization) as OrganizationDraft };
}

function companyProfileCommand(value: unknown): {
  readonly expected: { readonly name: string; readonly purpose: string; readonly locale: string };
  readonly next: { readonly name: string; readonly purpose: string; readonly locale: string };
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["expected", "next"].includes(key))) return null;
  const profile = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const record = candidate as Record<string, unknown>;
    if (Object.keys(record).some((key) => !["name", "purpose", "locale"].includes(key)) ||
        typeof record.name !== "string" || typeof record.purpose !== "string" ||
        typeof record.locale !== "string") return null;
    return { name: record.name, purpose: record.purpose, locale: record.locale };
  };
  const expected = profile(input.expected);
  const next = profile(input.next);
  return expected && next ? { expected, next } : null;
}

function archiveDepartmentCommand(value: unknown): {
  readonly destinationDepartmentId: string;
  readonly expectedResponsibilityRevision: number;
  readonly reason: string;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!requiredId(input.destinationDepartmentId) ||
      !Number.isSafeInteger(input.expectedResponsibilityRevision) || Number(input.expectedResponsibilityRevision) < 0 ||
      typeof input.reason !== "string" || !input.reason.trim() || input.reason.length > 1_000 ||
      Object.keys(input).some((key) => !["destinationDepartmentId", "expectedResponsibilityRevision", "reason"].includes(key))) {
    return null;
  }
  return { destinationDepartmentId: input.destinationDepartmentId as string,
    expectedResponsibilityRevision: Number(input.expectedResponsibilityRevision), reason: input.reason.trim() };
}

function archiveCompanyCommand(value: unknown): {
  readonly expectedStatus: "active";
  readonly exportDigest: string;
  readonly retentionPolicyId: string;
  readonly reason: string;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.expectedStatus !== "active" || typeof input.exportDigest !== "string" ||
      !/^sha256:[a-f0-9]{64}$/.test(input.exportDigest) || !requiredId(input.retentionPolicyId) ||
      typeof input.reason !== "string" || !input.reason.trim() || [...input.reason.trim()].length > 1_000 ||
      Object.keys(input).some((key) => !["expectedStatus", "exportDigest", "retentionPolicyId", "reason"].includes(key))) {
    return null;
  }
  return { expectedStatus: "active", exportDigest: input.exportDigest,
    retentionPolicyId: input.retentionPolicyId as string, reason: input.reason.trim() };
}

function createHumanInviteCommand(value: unknown): {
  readonly email: string;
  readonly departmentId: string;
  readonly title: string;
  readonly role: "owner" | "admin" | "operator" | "viewer";
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.email !== "string" || typeof input.departmentId !== "string" ||
      typeof input.title !== "string" || !input.title.trim() ||
      !["owner", "admin", "operator", "viewer"].includes(String(input.role)) ||
      !requiredId(input.departmentId) || [...input.title.trim()].length > 120) return null;
  return {
    email: input.email, departmentId: input.departmentId, title: input.title,
    role: input.role as "owner" | "admin" | "operator" | "viewer",
  };
}

function updateHumanMemberCommand(value: unknown): {
  readonly expectedRole: "owner" | "admin" | "operator" | "viewer";
  readonly expectedStatus: "pending" | "active" | "suspended" | "archived";
  readonly role: "owner" | "admin" | "operator" | "viewer";
  readonly status: "active" | "suspended";
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const roles = ["owner", "admin", "operator", "viewer"];
  const statuses = ["pending", "active", "suspended", "archived"];
  if (!roles.includes(String(input.expectedRole)) || !roles.includes(String(input.role)) ||
      !statuses.includes(String(input.expectedStatus)) ||
      !(input.status === "active" || input.status === "suspended")) return null;
  return input as ReturnType<typeof updateHumanMemberCommand> & object;
}

function revisionedArrayCommand(value: unknown, key: string): {
  readonly expectedRevision: number;
  readonly values: readonly unknown[];
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 0 ||
      !Array.isArray(input[key])) return null;
  return { expectedRevision: Number(input.expectedRevision), values: structuredClone(input[key]) };
}

function governanceCatalogCommand(value: unknown): {
  readonly expectedRevision: number;
  readonly modelRoutingPolicies: readonly unknown[];
  readonly dataAuthorizationContracts: readonly unknown[];
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 0 ||
      !Array.isArray(input.modelRoutingPolicies) || !Array.isArray(input.dataAuthorizationContracts)) return null;
  return {
    expectedRevision: Number(input.expectedRevision),
    modelRoutingPolicies: structuredClone(input.modelRoutingPolicies),
    dataAuthorizationContracts: structuredClone(input.dataAuthorizationContracts),
  };
}

function planningRevision(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function nullablePlanningId(value: unknown): string | null | undefined {
  return value === null ? null : requiredId(value);
}

function nullablePlanningText(value: unknown, maximum: number): string | null | undefined {
  if (value === null || value === "") return null;
  return typeof value === "string" && value.trim() && [...value.trim()].length <= maximum
    ? value.trim()
    : undefined;
}

function goalCommand(value: unknown, update: boolean): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const revision = planningRevision(input.expectedRevision);
  const parentId = nullablePlanningId(input.parentId);
  const ownerAgentId = nullablePlanningId(input.ownerAgentId);
  const description = nullablePlanningText(input.description, 2_000);
  if (revision === null || typeof input.title !== "string" || !input.title.trim() ||
      [...input.title.trim()].length > 120 || description === undefined ||
      !["company", "team", "agent", "task"].includes(String(input.level)) ||
      parentId === undefined || ownerAgentId === undefined ||
      !requiredId(input.accountableHumanId) ||
      (update && !["planned", "active", "achieved", "cancelled"].includes(String(input.status)))) {
    return null;
  }
  return {
    title: input.title.trim(), description, level: input.level,
    parentId, ownerAgentId, accountableHumanId: input.accountableHumanId,
    ...(update ? { status: input.status } : {}), expectedRevision: revision,
  };
}

function projectCommand(value: unknown, update: boolean): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const revision = planningRevision(input.expectedRevision);
  const description = nullablePlanningText(input.description, 2_000);
  const leadAgentId = nullablePlanningId(input.leadAgentId);
  const targetDate = input.targetDate === null || input.targetDate === "" ? null
    : typeof input.targetDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.targetDate)
      ? input.targetDate
      : undefined;
  const goalIds = input.goalIds;
  const departmentIds = input.departmentIds;
  if (revision === null || typeof input.name !== "string" || !input.name.trim() ||
      [...input.name.trim()].length > 120 || description === undefined || leadAgentId === undefined ||
      targetDate === undefined || !requiredId(input.accountableHumanId) ||
      !Array.isArray(goalIds) || goalIds.length > 100 || !goalIds.every(requiredId) ||
      !Array.isArray(departmentIds) || !departmentIds.length || departmentIds.length > 64 ||
      !departmentIds.every(requiredId) ||
      (update && !["backlog", "planned", "in_progress", "completed", "cancelled"].includes(String(input.status)))) {
    return null;
  }
  return {
    goalIds: [...goalIds], name: input.name.trim(), description,
    leadAgentId, accountableHumanId: input.accountableHumanId,
    departmentIds: [...departmentIds], targetDate,
    ...(update ? { status: input.status } : {}), expectedRevision: revision,
  };
}

function registerConnectorCommand(value: unknown): {
  readonly connectorId: string;
  readonly executionResidency: "MANAGED_CLOUD" | "CUSTOMER_ENVIRONMENT";
  readonly expectedRevision: number;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!requiredId(input.connectorId) || !Number.isSafeInteger(input.expectedRevision) ||
      Number(input.expectedRevision) < 0 ||
      !["MANAGED_CLOUD", "CUSTOMER_ENVIRONMENT"].includes(String(input.executionResidency))) return null;
  return { connectorId: input.connectorId as string,
    executionResidency: input.executionResidency as "MANAGED_CLOUD" | "CUSTOMER_ENVIRONMENT",
    expectedRevision: Number(input.expectedRevision) };
}

function connectorStatusCommand(value: unknown): {
  readonly status: "ENABLED" | "DISABLED";
  readonly expectedRevision: number;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 0 ||
      !["ENABLED", "DISABLED"].includes(String(input.status))) return null;
  return { status: input.status as "ENABLED" | "DISABLED", expectedRevision: Number(input.expectedRevision) };
}

function createDataAuthorizationCommand(value: unknown): {
  readonly id: string;
  readonly dataSourceId: string;
  readonly authorizedAgentIds: readonly string[];
  readonly authorizedOperations: readonly ("READ" | "WRITE" | "EXPORT")[];
  readonly allowedPurposes: readonly string[];
  readonly maximumClassification: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
  readonly allowedExportDestinations: readonly string[];
  readonly validUntil: string;
  readonly expectedRevision: number;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const agents = input.authorizedAgentIds;
  const operations = input.authorizedOperations;
  const purposes = input.allowedPurposes;
  const destinations = input.allowedExportDestinations;
  if (!requiredId(input.id) || !requiredId(input.dataSourceId) ||
      !Array.isArray(agents) || !agents.length || !agents.every(requiredId) ||
      !Array.isArray(operations) || !operations.length ||
      !operations.every((item) => ["READ", "WRITE", "EXPORT"].includes(String(item))) ||
      !Array.isArray(purposes) || !purposes.length ||
      !purposes.every((item) => typeof item === "string" && item.trim().length > 0 && [...item].length <= 120) ||
      !["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"].includes(String(input.maximumClassification)) ||
      !Array.isArray(destinations) || !destinations.every(requiredId) ||
      typeof input.validUntil !== "string" || !Number.isFinite(Date.parse(input.validUntil)) ||
      !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 0) return null;
  return structuredClone(input) as ReturnType<typeof createDataAuthorizationCommand>;
}

function dataAuthorizationStatusCommand(value: unknown): {
  readonly status: "ACTIVE" | "SUSPENDED" | "REVOKED";
  readonly expectedRevision: number;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!["ACTIVE", "SUSPENDED", "REVOKED"].includes(String(input.status)) ||
      !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 0) return null;
  return { status: input.status as "ACTIVE" | "SUSPENDED" | "REVOKED",
    expectedRevision: Number(input.expectedRevision) };
}

function createModelRouteCommand(value: unknown): {
  readonly policyId: string; readonly routeId: string; readonly providerAdapterId: string;
  readonly modelReference: string; readonly credentialReference: string;
  readonly allowedDataClassifications: readonly ("PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED")[];
  readonly residency: "MANAGED_CLOUD" | "LOCAL"; readonly expectedRevision: number;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const classifications = input.allowedDataClassifications;
  if (![input.policyId, input.routeId, input.providerAdapterId, input.modelReference, input.credentialReference]
        .every(requiredId) || !Array.isArray(classifications) || !classifications.length ||
      !classifications.every((value) => ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"].includes(String(value))) ||
      !["MANAGED_CLOUD", "LOCAL"].includes(String(input.residency)) ||
      !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 0) return null;
  return structuredClone(input) as NonNullable<ReturnType<typeof createModelRouteCommand>>;
}

function modelRouteStatusCommand(value: unknown): { readonly enabled: boolean; readonly expectedRevision: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.enabled !== "boolean" || !Number.isSafeInteger(input.expectedRevision) ||
      Number(input.expectedRevision) < 0) return null;
  return { enabled: input.enabled, expectedRevision: Number(input.expectedRevision) };
}

function createToolProfileCommand(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>; const entries = input.entries;
  if (!requiredId(input.profileId) || !requiredId(input.profileKey) || typeof input.name !== "string" ||
      !input.name.trim() || [...input.name].length > 160 ||
      !(input.description === null || input.description === undefined ||
        typeof input.description === "string" && [...input.description].length <= 4_000) ||
      !["deny", "allow"].includes(String(input.defaultAction)) || !Array.isArray(entries) || entries.length > 250 ||
      !entries.every((entry) => entry && typeof entry === "object" && !Array.isArray(entry) &&
        requiredId((entry as Record<string, unknown>).id) &&
        ["application", "connection", "catalog_entry", "tool_name", "risk_level"].includes(String((entry as Record<string, unknown>).selectorType)) &&
        requiredId((entry as Record<string, unknown>).selectorValue) &&
        ["include", "exclude"].includes(String((entry as Record<string, unknown>).effect))) ||
      !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 0) return null;
  return structuredClone(input);
}

function bindToolProfileCommand(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!requiredId(input.bindingId) || !["company", "agent", "project"].includes(String(input.targetType)) ||
      !requiredId(input.targetId) || !Number.isSafeInteger(input.priority) || Number(input.priority) < 0 ||
      Number(input.priority) > 10_000 || !Number.isSafeInteger(input.expectedRevision) ||
      Number(input.expectedRevision) < 0) return null;
  return structuredClone(input);
}

function createToolPolicyCommand(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>; const policy = input.policy;
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) return null;
  const row = policy as Record<string, unknown>;
  if (!requiredId(row.id) || typeof row.name !== "string" || !row.name.trim() || [...row.name].length > 160 ||
      !["allow", "block", "require_approval", "trust_rule", "rate_limit"].includes(String(row.policyType)) ||
      !Number.isSafeInteger(row.priority) || Number(row.priority) < 0 || Number(row.priority) > 10_000 ||
      !row.selectors || typeof row.selectors !== "object" || Array.isArray(row.selectors) ||
      Object.values(row.selectors as Record<string, unknown>).some((item) => !requiredId(item)) ||
      !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 0) return null;
  return structuredClone(input);
}

function toolProfileStatusCommand(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!["draft", "active", "disabled", "archived"].includes(String(input.status)) ||
      !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 0) return null;
  return { status: input.status, expectedRevision: Number(input.expectedRevision) };
}

function upsertBudgetPolicyCommand(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!requiredId(input.policyId) || !["company", "agent", "project"].includes(String(input.scopeType)) ||
      !requiredId(input.scopeId) || input.metric !== undefined && input.metric !== "billed_cents" ||
      input.windowKind !== undefined && !["calendar_month_utc", "lifetime"].includes(String(input.windowKind)) ||
      !Number.isSafeInteger(input.amount) || Number(input.amount) < 0 ||
      input.warnPercent !== undefined && (!Number.isSafeInteger(input.warnPercent) || Number(input.warnPercent) < 1 || Number(input.warnPercent) > 99) ||
      ["hardStopEnabled", "notifyEnabled", "isActive"].some((key) => input[key] !== undefined && typeof input[key] !== "boolean") ||
      !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 0) return null;
  return structuredClone(input);
}

function agentLifecycleCommand(value: unknown, operation: string): {
  readonly operation: "APPROVE" | "PAUSE" | "RESUME" | "CLEAR_ERROR" | "TERMINATE";
  readonly expectedRevision: number;
  readonly pauseReason?: "manual" | "budget" | "system";
} | null {
  const operations = new Set(["APPROVE", "PAUSE", "RESUME", "CLEAR_ERROR", "TERMINATE"]);
  if (!operations.has(operation) || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 0) return null;
  if (operation === "PAUSE" && input.pauseReason !== undefined &&
      !["manual", "budget", "system"].includes(String(input.pauseReason))) return null;
  return {
    operation: operation as "APPROVE" | "PAUSE" | "RESUME" | "CLEAR_ERROR" | "TERMINATE",
    expectedRevision: Number(input.expectedRevision),
    ...(operation === "PAUSE" && input.pauseReason
      ? { pauseReason: input.pauseReason as "manual" | "budget" | "system" }
      : {}),
  };
}

function secretReferenceManagementCommand(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const expectedVersion = input.expectedVersion;
  if (!requiredId(input.referenceId) || !requiredId(input.providerAdapterId) ||
      !["CREATE", "ROTATE", "SUSPEND", "REVOKE"].includes(String(input.operation)) ||
      !["MODEL_PROVIDER", "DATA_CONNECTOR", "AGENT_CONNECTOR", "IDENTITY_ADAPTER"].includes(String(input.purpose)) ||
      (input.operation === "CREATE" ? expectedVersion !== null :
        !Number.isSafeInteger(expectedVersion) || Number(expectedVersion) < 1)) return null;
  const keys = Object.keys(input);
  if (keys.some((key) => !["referenceId", "operation", "purpose", "providerAdapterId", "expectedVersion"].includes(key))) {
    return null;
  }
  return structuredClone(input);
}

function responsibilityTransferCommand(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const backup = optionalId(input.newBackupHumanId);
  if (!requiredId(input.newAccountableHumanId) || backup === undefined ||
      !Number.isSafeInteger(input.expectedResponsibilityRevision) || Number(input.expectedResponsibilityRevision) < 0 ||
      typeof input.reason !== "string" || !input.reason.trim() || input.reason.length > 1_000 ||
      Object.keys(input).some((key) => !["newAccountableHumanId", "newBackupHumanId",
        "expectedResponsibilityRevision", "reason"].includes(key))) return null;
  return { newAccountableHumanId: input.newAccountableHumanId, newBackupHumanId: backup,
    expectedResponsibilityRevision: Number(input.expectedResponsibilityRevision), reason: input.reason.trim() };
}

function publicErrorCode(error: unknown) {
  if (!(error instanceof Error)) return "INTERNAL_ERROR";
  const known = new Set([
    "WORK_ALREADY_ASSIGNED",
    "TOOL_ACTIVITY_ALREADY_RECORDED",
    "TOOL_ACTIVITY_REQUIRED",
    "APPROVAL_REQUIRES_ACCOUNTABLE_HUMAN",
    "APPROVAL_ALREADY_DECIDED",
  ]);
  return known.has(error.message) ? error.message : "OPERATION_REJECTED";
}

function formalError(error: unknown): { readonly status: number; readonly code: string } {
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  if (code.startsWith("PENDING_APPROVAL_AGENT_CONFIG_FROZEN:")) {
    return { status: 409, code: "PENDING_APPROVAL_AGENT_CONFIG_FROZEN" };
  }
  if (code.startsWith("RESPONSIBILITY_TRANSFER_COMMAND_REQUIRED:")) {
    return { status: 409, code: "RESPONSIBILITY_TRANSFER_COMMAND_REQUIRED" };
  }
  if (code.startsWith("RESPONSIBILITY_AUTONOMY_COMMAND_REQUIRED:")) {
    return { status: 409, code: "RESPONSIBILITY_AUTONOMY_COMMAND_REQUIRED" };
  }
  if (code === "FORMAL_IDENTITY_REQUIRED") return { status: 401, code };
  if (code === "FIRST_ADMIN_ALREADY_CLAIMED") return { status: 409, code };
  if (code === "INSTANCE_ADMIN_REQUIRED") return { status: 403, code };
  if (code === "ORGANIZATION_ALREADY_REGISTERED") return { status: 409, code };
  if (code === "COMPANY_ACCESS_NOT_FOUND") return { status: 404, code };
  if (code === "TENANT_MISMATCH" || code === "AUTHORIZATION_PRINCIPAL_MISMATCH") {
    return { status: 403, code };
  }
  if (code === "COMPANY_PERMISSION_REQUIRED" || code === "COMPANY_VIEWER_READ_ONLY") {
    return { status: 403, code };
  }
  if (code === "APPROVAL_REQUIRES_ACCOUNTABLE_HUMAN") return { status: 403, code };
  if (code === "ORGANIZATION_NOT_FOUND" || code === "APPROVAL_REQUEST_NOT_FOUND") {
    return { status: 404, code };
  }
  if (code === "HUMAN_INVITE_NOT_FOUND") return { status: 404, code };
  if (code === "HUMAN_INVITE_IDENTITY_MISMATCH") return { status: 403, code };
  if (code === "COMPANY_MEMBERSHIP_NOT_FOUND" || code === "COMPANY_MEMBER_IDENTITY_NOT_FOUND") {
    return { status: 404, code };
  }
  if (["COMPANY_MEMBERSHIP_REVISION_CONFLICT", "LAST_ACTIVE_OWNER_REQUIRED",
    "ACCOUNTABLE_HUMAN_TRANSFER_REQUIRED", "EVENT_SEQUENCE_CONFLICT"].includes(code)) {
    return { status: 409, code };
  }
  if (["COMPANY_MEMBERSHIP_COMMAND_INVALID", "COMPANY_MEMBERSHIP_STATUS_TRANSITION_INVALID"]
    .includes(code)) return { status: 422, code };
  if (code === "AGENT_NOT_FOUND") return { status: 404, code };
  if ([
    "AGENT_LIFECYCLE_REVISION_CONFLICT",
    "AGENT_TERMINATED",
    "AGENT_NOT_PENDING_APPROVAL",
    "AGENT_PENDING_APPROVAL",
    "AGENT_NOT_PAUSED",
    "AGENT_NOT_IN_ERROR",
    "AGENT_CONNECTOR_NOT_REGISTERED",
    "AGENT_CONNECTOR_DISABLED",
    "AGENT_EXECUTION_PORT_NOT_REGISTERED",
    "AGENT_EXECUTION_PORT_UNAVAILABLE",
    "AGENT_REPORTING_CHAIN_INVALID",
  ].includes(code)) return { status: 409, code };
  if (["APPROVAL_BINDING_MISMATCH", "APPROVAL_EXPIRED", "APPROVAL_ALREADY_DECIDED"]
    .includes(code)) return { status: 409, code };
  if (["RESPONSIBILITY_CONTRACT_REVISION_CONFLICT", "RESPONSIBILITY_TRANSFER_NO_CHANGE",
    "RESPONSIBILITY_TRANSFER_PENDING_APPROVAL"].includes(code)) return { status: 409, code };
  if (code === "RESPONSIBILITY_CONTRACT_NOT_FOUND") return { status: 404, code };
  if (["RESPONSIBILITY_TRANSFER_COMMAND_INVALID", "RESPONSIBILITY_TRANSFER_HUMAN_INVALID"].includes(code)) {
    return { status: 422, code };
  }
  if (["COMPANY_PROFILE_REVISION_CONFLICT", "COMPANY_PROFILE_NO_CHANGE"].includes(code)) {
    return { status: 409, code };
  }
  if (code === "COMPANY_PROFILE_COMMAND_INVALID") return { status: 422, code };
  if (["COMPANY_LIFECYCLE_REVISION_CONFLICT", "COMPANY_ARCHIVE_PENDING_APPROVAL",
    "COMPANY_ARCHIVE_UNRESOLVED_WORK", "COMPANY_ARCHIVE_PENDING_OUTBOX",
    "COMPANY_ARCHIVE_EXPORT_STALE"].includes(code)) return { status: 409, code };
  if (code === "COMPANY_ARCHIVE_OWNER_REQUIRED") return { status: 403, code };
  if (["COMPANY_ARCHIVE_COMMAND_INVALID", "COMPANY_ARCHIVE_TIMESTAMP_INVALID"].includes(code)) {
    return { status: 422, code };
  }
  if (["DEPARTMENT_ARCHIVE_ACTIVE_WORK", "DEPARTMENT_ARCHIVE_PENDING_APPROVAL",
    "LAST_DEPARTMENT_REQUIRED"].includes(code)) return { status: 409, code };
  if (code === "DEPARTMENT_NOT_FOUND") return { status: 404, code };
  if (code === "DEPARTMENT_ARCHIVE_COMMAND_INVALID") return { status: 422, code };
  if (code === "INVALID_JSON" || code === "CORS_PREFLIGHT_INVALID") return { status: 400, code };
  if (code === "REQUEST_BODY_TOO_LARGE") return { status: 413, code };
  if (code === "DURABLE_BACKUP_INVALID") return { status: 422, code };
  if (code === "DURABLE_CONTROL_PLANE_NOT_EMPTY") return { status: 409, code };
  if (["RESTORE_COMPANY_ALREADY_EXISTS", "RESTORE_PENDING_OUTBOX", "RESTORE_PENDING_APPROVAL",
    "RESTORE_UNRESOLVED_WORK", "RESTORE_IDENTITY_REBIND_REQUIRED"].includes(code)) {
    return { status: 409, code };
  }
  if (["RESTORE_FORMAL_BACKUP_REQUIRED", "RESTORE_ORGANIZATION_REQUIRED",
    "RESTORE_COMPANY_BINDING_INVALID", "RESTORE_PERMISSION_GRANTS_INVALID"].includes(code)) {
    return { status: 422, code };
  }
  if (code === "PLANNING_REVISION_CONFLICT") return { status: 409, code };
  if (code === "WORK_NOT_FOUND") return { status: 404, code };
  if (code === "WORK_ATTEMPT_NOT_FOUND" || code === "AGENT_EXECUTION_PORT_NOT_REGISTERED") return { status: 404, code };
  if (code === "WORK_PAGE_INVALID") return { status: 422, code };
  if (code === "WORK_RUN_EVENT_PAGE_INVALID") return { status: 422, code };
  if (code === "COMPANY_ACTIVITY_PAGE_INVALID") return { status: 422, code };
  if (code === "ACCOUNTABILITY_LEDGER_CORRUPT" || code === "ACCOUNTABILITY_LEDGER_FIXTURE_FORBIDDEN") {
    return { status: 500, code };
  }
  if (["WORK_ATTEMPT_TERMINAL", "WORK_ATTEMPT_RECONCILIATION_REQUIRED",
    "WORK_ATTEMPT_RECONCILIATION_CONFLICT", "WORK_ATTEMPT_NOT_OUTCOME_UNKNOWN",
    "WORK_ATTEMPT_FENCED", "WORK_ATTEMPT_LEASE_EXPIRED"].includes(code)) return { status: 409, code };
  if (code === "CONNECTOR_CANCEL_UNSUPPORTED") return { status: 422, code };
  if (["WORK_ATTEMPT_RECONCILIATION_EVIDENCE_NOT_FOUND",
    "WORK_ATTEMPT_RECONCILIATION_RESULT_EVIDENCE_REQUIRED"].includes(code)) return { status: 422, code };
  if (["WORK_RETRY_NOT_ADMITTED", "WORK_RETRY_ALREADY_SUPERSEDED",
    "WORK_RETRY_RESPONSIBILITY_CHANGED", "WORK_RETRY_DATA_AUTHORIZATION_INVALID"].includes(code) ||
      code.startsWith("AGENT_NOT_INVOKABLE:")) return { status: 409, code };
  if (code === "GOAL_NOT_FOUND" || code === "PROJECT_NOT_FOUND") return { status: 404, code };
  if (["GOAL_STATUS_TRANSITION_INVALID", "PROJECT_STATUS_TRANSITION_INVALID",
    "PROJECT_ARCHIVED_TERMINAL", "PROJECT_TERMINAL_STATUS_REQUIRED"].includes(code)) {
    return { status: 409, code };
  }
  if (["CONNECTOR_CATALOG_REVISION_CONFLICT", "CONNECTOR_ALREADY_REGISTERED"]
    .includes(code)) return { status: 409, code };
  if (code === "CONNECTOR_NOT_REGISTERED") return { status: 404, code };
  if (["GOVERNANCE_CATALOG_REVISION_CONFLICT", "DATA_AUTHORIZATION_ALREADY_EXISTS",
    "DATA_AUTHORIZATION_REVOKED_TERMINAL"].includes(code)) return { status: 409, code };
  if (["DATA_AUTHORIZATION_NOT_FOUND", "DATA_AUTHORIZATION_AGENT_NOT_FOUND",
    "COMPANY_STRUCTURE_NOT_FOUND"].includes(code)) return { status: 404, code };
  if (code === "MODEL_ROUTE_NOT_FOUND" || code === "SECRET_REFERENCE_NOT_FOUND" ||
      code === "SECRET_MANAGEMENT_SESSION_NOT_FOUND" || code === "MODEL_PROVIDER_NOT_INSTALLED") return { status: 404, code };
  if (["MODEL_ROUTE_ALREADY_EXISTS", "MODEL_ROUTE_RUNTIME_UNAVAILABLE",
    "SECRET_REFERENCE_INACTIVE"].includes(code)) return { status: 409, code };
  if (["SECRET_REFERENCE_ALREADY_EXISTS", "SECRET_VERSION_MISMATCH", "SECRET_REFERENCE_BINDING_MISMATCH",
    "SECRET_REFERENCE_REVOKED", "SECRET_REFERENCE_CONSUMER_MISMATCH",
    "SECRET_LEASE_IDEMPOTENCY_CONFLICT"].includes(code)) return { status: 409, code };
  if (["MODEL_ROUTE_CAPABILITY_MISMATCH", "MODEL_ROUTE_SECRET_BINDING_INVALID",
    "SECRET_BROKER_NOT_INSTALLED", "SECRET_BROKER_PURPOSE_UNSUPPORTED", "SECRET_REFERENCE_INTENT_INVALID",
    "SECRET_REFERENCE_VERSION_INVALID", "SECRET_MANAGEMENT_SESSION_INVALID", "SECRET_MANAGEMENT_URL_INVALID",
    "SECRET_MANAGEMENT_RESULT_INVALID"].includes(code)) {
    return { status: 422, code };
  }
  if (["WORK_EXECUTION_PREPARATION_INVALID", "DATA_ACCESS_REQUEST_ID_INVALID",
    "DATA_AUTHORIZATION_ID_INVALID", "DATA_ACCESS_PREPARATION_INVALID",
    "SECRET_REFERENCE_ID_INVALID", "SECRET_LEASE_PREPARATION_INVALID"].includes(code)) {
    return { status: 422, code };
  }
  if (["WORK_EXECUTION_PREPARATION_BINDING_MISMATCH",
    "WORK_EXECUTION_PREPARATION_AUTHORITY_MISMATCH", "DATA_ACCESS_DENIED",
    "DATA_ACCESS_NOT_PREPARED", "WORK_PREPARATION_RETRY_NOT_PENDING"].includes(code)) {
    return { status: 409, code };
  }
  if (code === "WORK_EXECUTION_PREPARATION_NOT_FOUND") return { status: 404, code };
  if (code === "WORK_PREPARATION_INITIATOR_REQUIRED") return { status: 403, code };
  if (["TOOL_ACCESS_REVISION_CONFLICT", "TOOL_PROFILE_ALREADY_EXISTS",
    "TOOL_PROFILE_BINDING_ALREADY_EXISTS", "TOOL_POLICY_ALREADY_EXISTS",
    "TOOL_PROFILE_ARCHIVED_TERMINAL"].includes(code)) return { status: 409, code };
  if (["TOOL_PROFILE_NOT_FOUND", "TOOL_PROFILE_BINDING_TARGET_NOT_FOUND"].includes(code)) {
    return { status: 404, code };
  }
  if (["USAGE_BUDGET_REVISION_CONFLICT", "BUDGET_POLICY_SCOPE_CONFLICT"].includes(code)) return { status: 409, code };
  if (code === "BUDGET_HARD_STOP") return { status: 409, code };
  if (["BUDGET_SCOPE_NOT_FOUND", "COST_AGENT_NOT_FOUND"].includes(code)) return { status: 404, code };
  if (code === "INVALID_FORMAL_COMMAND") return { status: 422, code };
  if (code === "ORIGIN_NOT_ALLOWED") return { status: 403, code };
  if (code === "FORMAL_API_UNAVAILABLE" || code === "FORMAL_COMMAND_UNAVAILABLE" ||
      code === "FORMAL_ACCESS_UNAVAILABLE" || code === "SECRET_BROKER_MANAGEMENT_UNAVAILABLE" ||
      code === "SECRET_BROKER_UNAVAILABLE" || code === "WORK_EXECUTION_PREPARATION_UNAVAILABLE" ||
      code === "DATA_CONNECTOR_NOT_INSTALLED" || code === "DATA_CONNECTOR_NOT_FOUND" ||
      code === "DATA_CONNECTOR_UNAVAILABLE") {
    return { status: 503, code };
  }
  return { status: 409, code: "OPERATION_REJECTED" };
}

export function createCompanyOsHttpService(options: CompanyOsHttpServiceOptions): Server {
  const allowedOrigins = options.allowedOrigins ?? [];
  const maxBodyBytes = options.maxBodyBytes ?? 64 * 1024;
  const maxPortabilityBytes = options.maxPortabilityBytes ?? 8 * 1024 * 1024;
  const startedAt = Date.now();
  const metrics = options.metrics ?? (options.metricsEnabled ? new BoundedHttpMetrics() : null);

  const server = createServer(async (req, res) => {
    const method = req.method ?? "GET";
    const requestUrl = new URL(req.url ?? "/", "http://localhost");
    const path = requestUrl.pathname;
    const finishMetrics = metrics?.begin(method, path);
    if (finishMetrics) res.once("finish", () => finishMetrics(res.statusCode));
    const requestOrigin = req.headers.origin;
    if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
      res.setHeader("access-control-allow-origin", requestOrigin);
      res.setHeader("access-control-allow-credentials", "true");
      res.setHeader("vary", "Origin");
    }

    try {
      if (method === "OPTIONS") {
        if (!requestOrigin || !allowedOrigins.includes(requestOrigin)) throw new Error("ORIGIN_NOT_ALLOWED");
        const requestedMethod = req.headers["access-control-request-method"];
        const requestedHeaders = String(req.headers["access-control-request-headers"] ?? "")
          .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
        if (!path.startsWith("/api/") || typeof requestedMethod !== "string" ||
            !["GET", "POST", "PUT", "PATCH"].includes(requestedMethod.toUpperCase()) ||
            requestedHeaders.some((header) => header !== "content-type")) {
          throw new Error("CORS_PREFLIGHT_INVALID");
        }
        res.writeHead(204, {
          ...SECURITY_HEADERS,
          "access-control-allow-methods": "GET, POST, PUT, PATCH",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "600",
        });
        res.end();
        return;
      }
      if (path.startsWith("/api/auth/")) {
        if (!options.authHandler) throw new Error("FORMAL_AUTH_UNAVAILABLE");
        await options.authHandler(req, res);
        return;
      }
      if (method === "GET" && path === "/metrics" && metrics) {
        sendMetrics(res, metrics.render());
        return;
      }
      if (method === "GET" && path === "/health") {
        sendJson(res, 200, {
          status: "ok",
          service: "company-os",
          mode: options.serviceMode ?? "DEMO_FIXTURE",
          deploymentProfile: options.deploymentProfile,
          uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        });
        return;
      }
      if (method === "GET" && path === "/ready") {
        await options.runtime.snapshot();
        const readiness = options.operationalReadiness
          ? await options.operationalReadiness.getStatus()
          : { status: "ready" as const, checks: {} };
        metrics?.setDependencyHealth(readiness.checks);
        sendJson(res, readiness.status === "ready" ? 200 : 503, {
          ...readiness,
          service: "company-os",
          mode: options.serviceMode ?? "DEMO_FIXTURE",
          deploymentProfile: options.deploymentProfile,
        });
        return;
      }
      if (method === "GET" && path === "/api/v1/access") {
        if (!options.formalAccess) throw new Error("FORMAL_ACCESS_UNAVAILABLE");
        sendJson(res, 200, await options.formalAccess.getStatus(req));
        return;
      }
      if (method === "POST" && path === "/api/v1/bootstrap/claim") {
        if (options.deploymentProfile !== "self-hosted" ||
            (options.deploymentExposure ?? "private") !== "private") {
          sendStructuredError(res, 404, "ROUTE_NOT_FOUND");
          return;
        }
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        if (!options.formalDirectory?.claimFirstAdmin) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalDirectory.claimFirstAdmin(req));
        return;
      }
      if (method === "GET" && path === "/api/v1/companies") {
        if (!options.formalDirectory) throw new Error("FORMAL_API_UNAVAILABLE");
        sendJson(res, 200, await options.formalDirectory.listCompanies(req));
        return;
      }
      if (method === "POST" && path === "/api/v1/companies") {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = createCompanyCommand(await readJson(req, maxBodyBytes));
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalDirectory?.createCompany) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 201, await options.formalDirectory.createCompany(req, command));
        return;
      }
      if (method === "POST" && path === "/api/v1/companies/restore") {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = restoreCompanyCommand(await readJson(req, maxPortabilityBytes));
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalDirectory?.restoreCompany) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 201, await options.formalDirectory.restoreCompany(req, command));
        return;
      }
      if (method === "POST" && path === "/api/v1/companies/restore/inspection") {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = restoreCompanyCommand(await readJson(req, maxPortabilityBytes));
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalDirectory?.inspectCompanyRestore) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalDirectory.inspectCompanyRestore(req, command));
        return;
      }
      const organizationSetupRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/organization$/,
      );
      if (method === "POST" && organizationSetupRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = setupOrganizationCommand(await readJson(req, maxBodyBytes));
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalDirectory?.setupOrganization) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 201, await options.formalDirectory.setupOrganization(
          req,
          organizationSetupRoute[1] as string,
          command,
        ));
        return;
      }
      const organizationRevisionRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/organization\/revisions$/,
      );
      if (method === "POST" && organizationRevisionRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = reviseOrganizationCommand(await readJson(req, maxBodyBytes));
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalDirectory?.reviseOrganization) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalDirectory.reviseOrganization(
          req,
          organizationRevisionRoute[1] as string,
          command,
        ));
        return;
      }
      const companyProfileRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/profile$/,
      );
      if (method === "PATCH" && companyProfileRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = companyProfileCommand(await readJson(req, maxBodyBytes));
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalDirectory?.updateCompanyProfile) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalDirectory.updateCompanyProfile(
          req, companyProfileRoute[1] as string, command,
        ));
        return;
      }
      const companyArchiveRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/archive$/,
      );
      if (method === "POST" && companyArchiveRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = archiveCompanyCommand(await readJson(req, maxBodyBytes));
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalDirectory?.archiveCompany) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalDirectory.archiveCompany(
          req, companyArchiveRoute[1] as string, command,
        ));
        return;
      }
      const departmentArchiveRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/departments\/([a-z0-9][a-z0-9-]{0,63})\/archive$/,
      );
      if (method === "POST" && departmentArchiveRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = archiveDepartmentCommand(await readJson(req, maxBodyBytes));
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalDirectory?.archiveDepartment) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalDirectory.archiveDepartment(req,
          departmentArchiveRoute[1] as string, departmentArchiveRoute[2] as string, command));
        return;
      }
      const humanInviteCreateRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/human-invites$/,
      );
      const humanMembersRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/human-members$/,
      );
      if (method === "GET" && humanMembersRoute) {
        if (!options.formalDirectory?.listHumanMembers) throw new Error("FORMAL_API_UNAVAILABLE");
        sendJson(res, 200, await options.formalDirectory.listHumanMembers(
          req,
          humanMembersRoute[1] as string,
        ));
        return;
      }
      const humanMemberRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/human-members\/([a-z0-9][a-z0-9-]{0,63})$/,
      );
      if (method === "PATCH" && humanMemberRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = updateHumanMemberCommand(await readJson(req, maxBodyBytes));
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalDirectory?.updateHumanMember) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalDirectory.updateHumanMember(
          req,
          humanMemberRoute[1] as string,
          humanMemberRoute[2] as string,
          command,
        ));
        return;
      }
      if (method === "POST" && humanInviteCreateRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = createHumanInviteCommand(await readJson(req, maxBodyBytes));
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalDirectory?.createHumanInvite) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 201, await options.formalDirectory.createHumanInvite(
          req,
          humanInviteCreateRoute[1] as string,
          command,
        ));
        return;
      }
      const humanInviteAcceptRoute = path.match(
        /^\/api\/v1\/human-invites\/(company_os_invite_[A-Za-z0-9_-]{32,128})\/accept$/,
      );
      if (method === "POST" && humanInviteAcceptRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        if (!options.formalDirectory?.acceptHumanInvite) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 202, await options.formalDirectory.acceptHumanInvite(
          req,
          humanInviteAcceptRoute[1] as string,
        ));
        return;
      }
      if (method === "GET" && path === "/api/demo") {
        sendJson(res, 200, await options.runtime.snapshot());
        return;
      }
      const agentBossRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/agent-boss$/,
      );
      if (method === "GET" && agentBossRoute) {
        if (!options.formalApi) throw new Error("FORMAL_API_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.getAgentBoss(req, agentBossRoute[1] as string));
        return;
      }
      const administrationRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/administration$/,
      );
      if (method === "GET" && administrationRoute) {
        if (!options.formalApi?.getAdministration) throw new Error("FORMAL_API_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.getAdministration(req, administrationRoute[1] as string));
        return;
      }
      const accountabilityLedgerRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/accountability-ledger$/,
      );
      if (method === "GET" && accountabilityLedgerRoute) {
        if (!options.formalApi?.getAccountabilityLedger) throw new Error("FORMAL_API_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.getAccountabilityLedger(
          req, accountabilityLedgerRoute[1] as string,
        ));
        return;
      }
      const accountabilityExportRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/accountability-exports$/,
      );
      if (method === "POST" && accountabilityExportRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = accountabilityExportCommand(await readJson(req, maxBodyBytes));
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalApi?.exportAccountability) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.exportAccountability(
          req, accountabilityExportRoute[1] as string, command,
        ));
        return;
      }
      const planningRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/planning-catalog$/,
      );
      if (method === "GET" && planningRoute) {
        if (!options.formalApi?.getPlanning) throw new Error("FORMAL_API_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.getPlanning(req, planningRoute[1] as string));
        return;
      }
      if (method === "PUT" && planningRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const input = await readJson(req, maxBodyBytes);
        if (!input || typeof input !== "object" || Array.isArray(input) ||
            !Number.isSafeInteger((input as Record<string, unknown>).expectedRevision) ||
            !Array.isArray((input as Record<string, unknown>).goals) ||
            !Array.isArray((input as Record<string, unknown>).projects)) {
          throw new Error("INVALID_FORMAL_COMMAND");
        }
        if (!options.formalApi?.replacePlanning) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.replacePlanning(req, planningRoute[1] as string, input));
        return;
      }
      const goalCollectionRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/goals$/,
      );
      if (method === "POST" && goalCollectionRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = goalCommand(await readJson(req, maxBodyBytes), false);
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalApi?.createGoal) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 201, await options.formalApi.createGoal(
          req, goalCollectionRoute[1] as string, command,
        ));
        return;
      }
      const goalItemRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/goals\/([a-z0-9][a-z0-9-]{0,63})$/,
      );
      if (method === "PATCH" && goalItemRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = goalCommand(await readJson(req, maxBodyBytes), true);
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalApi?.updateGoal) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.updateGoal(
          req, goalItemRoute[1] as string, goalItemRoute[2] as string, command,
        ));
        return;
      }
      const projectCollectionRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/projects$/,
      );
      if (method === "POST" && projectCollectionRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = projectCommand(await readJson(req, maxBodyBytes), false);
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalApi?.createProject) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 201, await options.formalApi.createProject(
          req, projectCollectionRoute[1] as string, command,
        ));
        return;
      }
      const projectArchiveRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/projects\/([a-z0-9][a-z0-9-]{0,63})\/archive$/,
      );
      if (method === "POST" && projectArchiveRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const input = await readJson(req, maxBodyBytes);
        const revision = input && typeof input === "object" && !Array.isArray(input)
          ? planningRevision((input as Record<string, unknown>).expectedRevision)
          : null;
        if (revision === null) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalApi?.archiveProject) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.archiveProject(
          req, projectArchiveRoute[1] as string, projectArchiveRoute[2] as string,
          { expectedRevision: revision },
        ));
        return;
      }
      const projectItemRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/projects\/([a-z0-9][a-z0-9-]{0,63})$/,
      );
      if (method === "PATCH" && projectItemRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = projectCommand(await readJson(req, maxBodyBytes), true);
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalApi?.updateProject) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.updateProject(
          req, projectItemRoute[1] as string, projectItemRoute[2] as string, command,
        ));
        return;
      }
      const portabilityExportRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/portability\/export$/,
      );
      if (method === "GET" && portabilityExportRoute) {
        if (!options.formalApi?.exportCompany) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.exportCompany(
          req,
          portabilityExportRoute[1] as string,
        ));
        return;
      }
      const formalWorkRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/work$/,
      );
      if (method === "GET" && formalWorkRoute) {
        const cursorValue = requestUrl.searchParams.get("cursor") ?? "0";
        const limitValue = requestUrl.searchParams.get("limit") ?? "50";
        if (!/^\d+$/.test(cursorValue) || !/^\d+$/.test(limitValue)) throw new Error("WORK_PAGE_INVALID");
        const cursor = Number(cursorValue);
        const limit = Number(limitValue);
        if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
          throw new Error("WORK_PAGE_INVALID");
        }
        if (!options.formalApi?.listWork) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.listWork(req, formalWorkRoute[1] as string, { cursor, limit }));
        return;
      }
      if (method === "POST" && formalWorkRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const companyId = formalWorkRoute[1] as string;
        const command = formalWorkCommand(await readJson(req, maxBodyBytes), companyId);
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalApi?.dispatchWork) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 201, await options.formalApi.dispatchWork(req, companyId, command));
        return;
      }
      const formalWorkItemRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/work\/([a-z0-9][a-z0-9-]{0,63})$/,
      );
      if (method === "GET" && formalWorkItemRoute) {
        if (!options.formalApi?.getWork) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.getWork(
          req, formalWorkItemRoute[1] as string, formalWorkItemRoute[2] as string,
        ));
        return;
      }
      const formalActivityRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/activity$/,
      );
      if (method === "GET" && formalActivityRoute) {
        const afterValue = requestUrl.searchParams.get("afterSequence") ?? "0";
        const limitValue = requestUrl.searchParams.get("limit") ?? "100";
        if (!/^\d+$/.test(afterValue) || !/^\d+$/.test(limitValue)) {
          throw new Error("COMPANY_ACTIVITY_PAGE_INVALID");
        }
        const afterSequence = Number(afterValue);
        const limit = Number(limitValue);
        if (!Number.isSafeInteger(afterSequence) || afterSequence < 0 ||
            !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
          throw new Error("COMPANY_ACTIVITY_PAGE_INVALID");
        }
        if (!options.formalApi?.getCompanyActivity) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.getCompanyActivity(
          req, formalActivityRoute[1] as string, { afterSequence, limit },
        ));
        return;
      }
      const formalWorkRunEventsRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/work\/([a-z0-9][a-z0-9-]{0,63})\/attempts\/([a-z0-9][a-z0-9-]{0,63})\/events$/,
      );
      if (method === "GET" && formalWorkRunEventsRoute) {
        const afterValue = requestUrl.searchParams.get("afterSequence") ?? "0";
        const limitValue = requestUrl.searchParams.get("limit") ?? "50";
        if (!/^\d+$/.test(afterValue) || !/^\d+$/.test(limitValue)) throw new Error("WORK_RUN_EVENT_PAGE_INVALID");
        const afterSequence = Number(afterValue);
        const limit = Number(limitValue);
        if (!Number.isSafeInteger(afterSequence) || afterSequence < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
          throw new Error("WORK_RUN_EVENT_PAGE_INVALID");
        }
        if (!options.formalApi?.getWorkRunTimeline) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.getWorkRunTimeline(
          req, formalWorkRunEventsRoute[1] as string, formalWorkRunEventsRoute[2] as string,
          formalWorkRunEventsRoute[3] as string, { afterSequence, limit },
        ));
        return;
      }
      const formalWorkCancellationRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/work\/([a-z0-9][a-z0-9-]{0,63})\/attempts\/([a-z0-9][a-z0-9-]{0,63})\/cancellation$/,
      );
      if (method === "POST" && formalWorkCancellationRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const input = await readJson(req, maxBodyBytes);
        if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length) {
          throw new Error("INVALID_FORMAL_COMMAND");
        }
        if (!options.formalApi?.requestWorkCancellation) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 202, await options.formalApi.requestWorkCancellation(
          req,
          formalWorkCancellationRoute[1] as string,
          formalWorkCancellationRoute[2] as string,
          formalWorkCancellationRoute[3] as string,
        ));
        return;
      }
      const formalWorkReconciliationRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/work\/([a-z0-9][a-z0-9-]{0,63})\/attempts\/([a-z0-9][a-z0-9-]{0,63})\/reconciliation$/,
      );
      if (method === "POST" && formalWorkReconciliationRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const input = await readJson(req, maxBodyBytes);
        if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("INVALID_FORMAL_COMMAND");
        const candidate = input as Record<string, unknown>;
        if (!requiredId(candidate.evidenceId) || !["CONFIRMED_SUCCEEDED", "CONFIRMED_FAILED", "SAFE_TO_RETRY"].includes(String(candidate.resolution)) ||
            Object.keys(candidate).some((key) => !["resolution", "evidenceId"].includes(key))) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalApi?.reconcileWorkAttempt) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.reconcileWorkAttempt(req,
          formalWorkReconciliationRoute[1] as string, formalWorkReconciliationRoute[2] as string,
          formalWorkReconciliationRoute[3] as string, candidate));
        return;
      }
      const formalWorkRetryRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/work\/([a-z0-9][a-z0-9-]{0,63})\/attempts\/([a-z0-9][a-z0-9-]{0,63})\/retry$/,
      );
      if (method === "POST" && formalWorkRetryRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const input = await readJson(req, maxBodyBytes);
        if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalApi?.retryWorkAttempt) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 201, await options.formalApi.retryWorkAttempt(req,
          formalWorkRetryRoute[1] as string, formalWorkRetryRoute[2] as string,
          formalWorkRetryRoute[3] as string));
        return;
      }
      const formalWorkPreparationRetryRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/work\/([a-z0-9][a-z0-9-]{0,63})\/attempts\/([a-z0-9][a-z0-9-]{0,63})\/preparation\/retry$/,
      );
      if (method === "POST" && formalWorkPreparationRetryRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const input = await readJson(req, maxBodyBytes);
        if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length) {
          throw new Error("INVALID_FORMAL_COMMAND");
        }
        if (!options.formalApi?.retryWorkExecutionPreparation) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.retryWorkExecutionPreparation(
          req,
          formalWorkPreparationRetryRoute[1] as string,
          formalWorkPreparationRetryRoute[2] as string,
          formalWorkPreparationRetryRoute[3] as string,
        ));
        return;
      }
      const formalApprovalRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/approvals\/([a-z0-9][a-z0-9-]{0,63})\/decisions$/,
      );
      if (method === "POST" && formalApprovalRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = formalApprovalCommand(await readJson(req, maxBodyBytes));
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalApi?.decideApproval) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.decideApproval(
          req,
          formalApprovalRoute[1] as string,
          formalApprovalRoute[2] as string,
          command,
        ));
        return;
      }
      const connectorCatalogRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/connector-catalog$/,
      );
      const connectorCollectionRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/connectors$/,
      );
      if (method === "POST" && connectorCollectionRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = registerConnectorCommand(await readJson(req, maxBodyBytes));
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalApi?.registerConnectorRuntime) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 201, await options.formalApi.registerConnectorRuntime(
          req, connectorCollectionRoute[1] as string, command,
        ));
        return;
      }
      const connectorStatusRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/connectors\/([a-z0-9][a-z0-9-]{0,63})$/,
      );
      if (method === "PATCH" && connectorStatusRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = connectorStatusCommand(await readJson(req, maxBodyBytes));
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalApi?.setConnectorStatus) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.setConnectorStatus(
          req, connectorStatusRoute[1] as string, connectorStatusRoute[2] as string, command,
        ));
        return;
      }
      if (method === "PUT" && connectorCatalogRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = revisionedArrayCommand(await readJson(req, maxBodyBytes), "connectors");
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalApi?.replaceConnectorCatalog) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.replaceConnectorCatalog(
          req,
          connectorCatalogRoute[1] as string,
          { expectedRevision: command.expectedRevision, connectors: command.values },
        ));
        return;
      }
      const governanceCatalogRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/governance-catalog$/,
      );
      if (method === "PUT" && governanceCatalogRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = governanceCatalogCommand(await readJson(req, maxBodyBytes));
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalApi?.replaceGovernanceCatalog) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.replaceGovernanceCatalog(
          req,
          governanceCatalogRoute[1] as string,
          command,
        ));
        return;
      }
      const dataAuthorizationCollectionRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/data-authorization-contracts$/,
      );
      if (method === "POST" && dataAuthorizationCollectionRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = createDataAuthorizationCommand(await readJson(req, maxBodyBytes));
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalApi?.createDataAuthorizationContract) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 201, await options.formalApi.createDataAuthorizationContract(
          req, dataAuthorizationCollectionRoute[1] as string, command,
        ));
        return;
      }
      const dataAuthorizationStatusRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/data-authorization-contracts\/([a-z0-9][a-z0-9-]{0,63})$/,
      );
      if (method === "PATCH" && dataAuthorizationStatusRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = dataAuthorizationStatusCommand(await readJson(req, maxBodyBytes));
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalApi?.setDataAuthorizationStatus) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.setDataAuthorizationStatus(
          req, dataAuthorizationStatusRoute[1] as string,
          dataAuthorizationStatusRoute[2] as string, command,
        ));
        return;
      }
      const modelRouteCollectionRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/model-routes$/,
      );
      if (method === "POST" && modelRouteCollectionRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = createModelRouteCommand(await readJson(req, maxBodyBytes));
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalApi?.createModelRoute) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 201, await options.formalApi.createModelRoute(
          req, modelRouteCollectionRoute[1] as string, command,
        ));
        return;
      }
      const modelRouteStatusRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/model-routes\/([a-z0-9][a-z0-9-]{0,63})$/,
      );
      if (method === "PATCH" && modelRouteStatusRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = modelRouteStatusCommand(await readJson(req, maxBodyBytes));
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalApi?.setModelRouteEnabled) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.setModelRouteEnabled(
          req, modelRouteStatusRoute[1] as string, modelRouteStatusRoute[2] as string, command,
        ));
        return;
      }
      const toolProfileCollectionRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/tool-profiles$/,
      );
      if (method === "POST" && toolProfileCollectionRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = createToolProfileCommand(await readJson(req, maxBodyBytes));
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalApi?.createToolProfile) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 201, await options.formalApi.createToolProfile(req,
          toolProfileCollectionRoute[1] as string, command)); return;
      }
      const toolProfileRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/tool-profiles\/([a-z0-9][a-z0-9-]{0,63})$/,
      );
      if (method === "PATCH" && toolProfileRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = toolProfileStatusCommand(await readJson(req, maxBodyBytes));
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalApi?.setToolProfileStatus) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.setToolProfileStatus(req,
          toolProfileRoute[1] as string, toolProfileRoute[2] as string, command)); return;
      }
      const toolProfileBindingRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/tool-profiles\/([a-z0-9][a-z0-9-]{0,63})\/bindings$/,
      );
      if (method === "POST" && toolProfileBindingRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = bindToolProfileCommand(await readJson(req, maxBodyBytes));
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalApi?.bindToolProfile) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 201, await options.formalApi.bindToolProfile(req,
          toolProfileBindingRoute[1] as string, toolProfileBindingRoute[2] as string, command)); return;
      }
      const toolPolicyCollectionRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/tool-policies$/,
      );
      if (method === "POST" && toolPolicyCollectionRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = createToolPolicyCommand(await readJson(req, maxBodyBytes));
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalApi?.createToolPolicy) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 201, await options.formalApi.createToolPolicy(req,
          toolPolicyCollectionRoute[1] as string, command)); return;
      }
      const budgetPolicyCollectionRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/budgets\/policies$/,
      );
      if (method === "POST" && budgetPolicyCollectionRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = upsertBudgetPolicyCommand(await readJson(req, maxBodyBytes));
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalApi?.upsertBudgetPolicy) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.upsertBudgetPolicy(req,
          budgetPolicyCollectionRoute[1] as string, command)); return;
      }
      const responsibilityContractsRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/responsibility-contracts$/,
      );
      if (method === "PUT" && responsibilityContractsRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = revisionedArrayCommand(await readJson(req, maxBodyBytes), "contracts");
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalApi?.replaceResponsibilityContracts) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.replaceResponsibilityContracts(
          req,
          responsibilityContractsRoute[1] as string,
          { expectedRevision: command.expectedRevision, contracts: command.values },
        ));
        return;
      }
      const agentLifecycleRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/agents\/([a-z0-9][a-z0-9-]{0,63})\/(approve|pause|resume|clear-error|terminate)$/,
      );
      if (method === "POST" && agentLifecycleRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const operation = ({
          approve: "APPROVE", pause: "PAUSE", resume: "RESUME",
          "clear-error": "CLEAR_ERROR", terminate: "TERMINATE",
        } as const)[agentLifecycleRoute[3] as "approve" | "pause" | "resume" | "clear-error" | "terminate"];
        const command = agentLifecycleCommand(await readJson(req, maxBodyBytes), operation);
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalApi?.transitionAgentLifecycle) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.transitionAgentLifecycle(
          req,
          agentLifecycleRoute[1] as string,
          agentLifecycleRoute[2] as string,
          command,
        ));
        return;
      }
      const responsibilityTransferRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/agents\/([a-z0-9][a-z0-9-]{0,63})\/responsibility-transfers$/,
      );
      if (method === "POST" && responsibilityTransferRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = responsibilityTransferCommand(await readJson(req, maxBodyBytes));
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalApi?.transferResponsibility) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.transferResponsibility(req,
          responsibilityTransferRoute[1] as string, responsibilityTransferRoute[2] as string, command));
        return;
      }
      const secretReferenceSessionsRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/secret-reference-sessions$/,
      );
      if (method === "POST" && secretReferenceSessionsRoute) {
        if (!isAllowedOrigin(req, allowedOrigins)) throw new Error("ORIGIN_NOT_ALLOWED");
        const command = secretReferenceManagementCommand(await readJson(req, maxBodyBytes));
        if (!command) throw new Error("INVALID_FORMAL_COMMAND");
        if (!options.formalApi?.beginSecretReferenceManagement) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 201, await options.formalApi.beginSecretReferenceManagement(
          req, secretReferenceSessionsRoute[1] as string, command,
        ));
        return;
      }
      const secretReferenceSessionRoute = path.match(
        /^\/api\/v1\/companies\/([a-z0-9][a-z0-9-]{0,63})\/secret-reference-sessions\/([a-z0-9][a-z0-9-]{0,63})$/,
      );
      if (method === "GET" && secretReferenceSessionRoute) {
        if (!options.formalApi?.confirmSecretReferenceManagement) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        sendJson(res, 200, await options.formalApi.confirmSecretReferenceManagement(
          req, secretReferenceSessionRoute[1] as string, secretReferenceSessionRoute[2] as string,
        ));
        return;
      }
      if (method === "POST" && path === "/api/demo/actions") {
        if (!isAllowedOrigin(req, allowedOrigins)) {
          sendError(res, 403, "ORIGIN_NOT_ALLOWED", "Request origin is not allowed.");
          return;
        }
        const body = actionFromBody(await readJson(req, maxBodyBytes));
        if (!body) {
          sendError(res, 422, "INVALID_ACTION", "Action payload is invalid.");
          return;
        }
        const state = body.action === "ASSIGN"
          ? await options.runtime.assignTask()
          : body.action === "ADVANCE"
            ? await options.runtime.advance()
            : body.action === "DECIDE"
              ? await options.runtime.decide(body.decision)
              : await options.runtime.reset();
        sendJson(res, 200, state);
        return;
      }
      sendError(res, 404, "ROUTE_NOT_FOUND", "Route not found.");
    } catch (error) {
      if (method === "OPTIONS") {
        const response = formalError(error);
        sendStructuredError(res, response.status, response.code);
        return;
      }
      if (path.startsWith("/api/auth/")) {
        sendStructuredError(res, 503, "FORMAL_AUTH_UNAVAILABLE");
        return;
      }
      if (path.startsWith("/api/v1/")) {
        const response = formalError(error);
        sendStructuredError(res, response.status, response.code);
        return;
      }
      if (error instanceof Error && error.message === "REQUEST_BODY_TOO_LARGE") {
        sendError(res, 413, "REQUEST_BODY_TOO_LARGE", "Request body is too large.");
        return;
      }
      if (error instanceof Error && error.message === "INVALID_JSON") {
        sendError(res, 400, "INVALID_JSON", "Request body must be valid JSON.");
        return;
      }
      sendError(res, 409, publicErrorCode(error), "Operation could not be completed.");
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
  server.maxRequestsPerSocket = 100;
  server.maxConnections = 1_024;
  return server;
}
