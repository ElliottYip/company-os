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
  return typeof input[key] === "string" && input[key] !== "";
}

export function parseConnectorEnvelope(input: unknown): ParseResult {
  if (
    !isRecord(input) ||
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

  return { ok: true, value: input as unknown as ConnectorEnvelope };
}

