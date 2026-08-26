export const CONNECTOR_PROTOCOL_VERSION = "1.0" as const;

export type ConnectorMessageType =
  | "capabilities.describe"
  | "identity.bind"
  | "health.report"
  | "task.submit"
  | "task.progress"
  | "task.pause"
  | "task.resume"
  | "task.cancel"
  | "evidence.record"
  | "result.record"
  | "runtime.prove";

export interface ConnectorEnvelope<TPayload = unknown> {
  readonly connectorId: string;
  readonly protocolVersion: typeof CONNECTOR_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly sentAt: string;
  readonly type: ConnectorMessageType;
  readonly payload: TPayload;
  readonly idempotencyKey?: string;
  readonly timeoutAt?: string;
}

export interface ConnectorError {
  readonly code: string;
  readonly message: string;
}

export type ParseResult =
  | { readonly ok: true; readonly value: ConnectorEnvelope }
  | { readonly ok: false; readonly error: ConnectorError };

const MESSAGE_TYPES = new Set<ConnectorMessageType>([
  "capabilities.describe",
  "identity.bind",
  "health.report",
  "task.submit",
  "task.progress",
  "task.pause",
  "task.resume",
  "task.cancel",
  "evidence.record",
  "result.record",
  "runtime.prove",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasString(input: Record<string, unknown>, key: string): boolean {
  return typeof input[key] === "string" && input[key] !== "" && input[key].length <= 512;
}

function hasStringArray(input: Record<string, unknown>, key: string): boolean {
  const value = input[key];
  return Array.isArray(value) && value.length <= 128 && value.every((item) =>
    typeof item === "string" && item.length > 0 && item.length <= 512
  );
}

function hasOptionalStringArray(input: Record<string, unknown>, key: string): boolean {
  return !(key in input) || hasStringArray(input, key);
}

const MODEL_BINDING_KEYS = new Set([
  "policyId",
  "routeId",
  "providerAdapterId",
  "modelReference",
  "classification",
  "residency",
  "executionGrantReference",
]);

function validModelBinding(value: unknown, executionGrantReferences: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(executionGrantReferences)) return false;
  if (!Object.keys(value).every((key) => MODEL_BINDING_KEYS.has(key))) return false;
  return hasString(value, "policyId") && hasString(value, "routeId") &&
    hasString(value, "providerAdapterId") && hasString(value, "modelReference") &&
    hasString(value, "executionGrantReference") &&
    ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"].includes(String(value.classification)) &&
    (value.residency === "MANAGED_CLOUD" || value.residency === "LOCAL") &&
    executionGrantReferences.includes(value.executionGrantReference);
}

function validOptionalModelBinding(payload: Record<string, unknown>): boolean {
  return !("modelBinding" in payload) ||
    validModelBinding(payload.modelBinding, payload.executionGrantReferences);
}

const FORBIDDEN_KEYS = /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|credential|session|private[_-]?reasoning)/i;

function containsForbiddenMaterial(value: unknown, depth = 0): boolean {
  if (depth > 16) return true;
  if (Array.isArray(value)) return value.some((item) => containsForbiddenMaterial(item, depth + 1));
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) =>
    FORBIDDEN_KEYS.test(key) || containsForbiddenMaterial(child, depth + 1)
  );
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value));
}

function validExactAction(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return hasString(value, "id") && hasString(value, "type") && hasString(value, "description") &&
    typeof value.inputDigest === "string" && /^sha256:[a-f0-9]{64}$/.test(value.inputDigest) &&
    (value.risk === "HIGH" || value.risk === "CRITICAL");
}

function validPayload(type: ConnectorMessageType, payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  switch (type) {
    case "capabilities.describe":
      return Object.keys(payload).length === 0;
    case "identity.bind":
      return hasString(payload, "connectorId") && hasString(payload, "agentId") &&
        hasString(payload, "externalPrincipalReference") && validTimestamp(payload.boundAt);
    case "health.report":
      return Object.keys(payload).length <= 16;
    case "task.submit":
      return hasString(payload, "workId") && hasString(payload, "goalReference") &&
        hasStringArray(payload, "permissionReferences") &&
        hasStringArray(payload, "dataAuthorizationReferences") &&
        hasOptionalStringArray(payload, "governedDataReferences") &&
        hasOptionalStringArray(payload, "dataEvidenceReferences") &&
        hasOptionalStringArray(payload, "executionGrantReferences") &&
        validOptionalModelBinding(payload) &&
        hasString(payload, "idempotencyKey") && validTimestamp(payload.timeoutAt);
    case "task.progress":
      return hasString(payload, "workId") && Number.isInteger(payload.sequence) &&
        Number(payload.sequence) > 0 && hasString(payload, "state") && hasString(payload, "summary");
    case "task.pause":
      return hasString(payload, "workId") && hasString(payload, "approvalRequestId") &&
        validExactAction(payload.action) && hasStringArray(payload, "evidenceReferences") &&
        (payload.resultReference === null || hasString(payload, "resultReference")) &&
        validTimestamp(payload.expiresAt);
    case "task.resume":
      return hasString(payload, "workId") && hasString(payload, "approvalRequestId");
    case "task.cancel":
      return hasString(payload, "workId") && hasString(payload, "reason");
    case "evidence.record":
      return hasString(payload, "workId") && hasString(payload, "evidenceReference") &&
        hasString(payload, "contentDigest");
    case "result.record":
      return hasString(payload, "workId") && hasString(payload, "resultReference") &&
        hasStringArray(payload, "evidenceReferences") && hasString(payload, "status");
    case "runtime.prove":
      return hasString(payload, "proofId") && hasString(payload, "connectorId") &&
        validTimestamp(payload.issuedAt) && validTimestamp(payload.expiresAt) &&
        hasString(payload, "digest");
  }
}

export function parseConnectorEnvelope(input: unknown): ParseResult {
  let serializedLength = Number.POSITIVE_INFINITY;
  try {
    serializedLength = JSON.stringify(input).length;
  } catch {
    // Invalid input is handled by the common envelope error below.
  }
  if (
    !isRecord(input) ||
    serializedLength > 65_536 ||
    !hasString(input, "connectorId") ||
    !hasString(input, "protocolVersion") ||
    !hasString(input, "requestId") ||
    !hasString(input, "sentAt") ||
    !hasString(input, "type") ||
    !("payload" in input)
  ) {
    return {
      ok: false,
      error: {
        code: "INVALID_CONNECTOR_ENVELOPE",
        message: "Connector envelope is missing required string fields.",
      },
    };
  }

  if (
    input.protocolVersion !== CONNECTOR_PROTOCOL_VERSION ||
    !MESSAGE_TYPES.has(input.type as ConnectorMessageType)
  ) {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_CONNECTOR_MESSAGE",
        message: "Connector protocol version or message type is unsupported.",
      },
    };
  }

  if (!validTimestamp(input.sentAt) || containsForbiddenMaterial(input.payload)) {
    return {
      ok: false,
      error: {
        code: "UNSAFE_CONNECTOR_PAYLOAD",
        message: "Connector payload is invalid, oversized, or contains forbidden material.",
      },
    };
  }
  const type = input.type as ConnectorMessageType;
  if (!validPayload(type, input.payload)) {
    return {
      ok: false,
      error: {
        code: "INVALID_CONNECTOR_PAYLOAD",
        message: `Connector payload does not match ${type}.`,
      },
    };
  }
  if (type === "task.submit") {
    const payload = input.payload as Record<string, unknown>;
    if (
      !hasString(input, "idempotencyKey") ||
      !validTimestamp(input.timeoutAt) ||
      input.idempotencyKey !== payload.idempotencyKey ||
      input.timeoutAt !== payload.timeoutAt ||
      Date.parse(input.timeoutAt as string) <= Date.parse(input.sentAt as string)
    ) {
      return {
        ok: false,
        error: {
          code: "INVALID_CONNECTOR_TIMING",
          message: "Task timing or idempotency fields do not match the envelope.",
        },
      };
    }
  }
  if (type === "task.pause") {
    const payload = input.payload as Record<string, unknown>;
    if (Date.parse(payload.expiresAt as string) <= Date.parse(input.sentAt as string)) {
      return { ok: false, error: { code: "INVALID_CONNECTOR_TIMING",
        message: "Approval expiry must be after the pause request." } };
    }
  }

  return { ok: true, value: input as unknown as ConnectorEnvelope };
}
