import type { Identifier } from "./control-plane.ts";

export type ConnectorOperation =
  | "SUBMIT"
  | "PROGRESS"
  | "PAUSE"
  | "RESUME"
  | "CANCEL"
  | "EVIDENCE"
  | "RESULT";

export interface ConnectorRegistration {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly displayName: string;
  readonly protocolVersion: "1.0";
  readonly operations: readonly ConnectorOperation[];
  readonly maximumTimeoutSeconds: number;
  readonly executionResidency: "MANAGED_CLOUD" | "CUSTOMER_ENVIRONMENT";
  readonly secretReferenceId: Identifier | null;
  readonly status: "ENABLED" | "DISABLED";
}

const PORTABLE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const OPERATIONS = new Set<ConnectorOperation>([
  "SUBMIT", "PROGRESS", "PAUSE", "RESUME", "CANCEL", "EVIDENCE", "RESULT",
]);

function validId(value: string, code: string): Identifier {
  const normalized = value.trim();
  if (!PORTABLE_ID.test(normalized)) throw new Error(code);
  return normalized;
}

export function validateConnectorCatalog(
  candidates: readonly ConnectorRegistration[],
): readonly ConnectorRegistration[] {
  const ids = new Set<Identifier>();
  return candidates.map((candidate) => {
    const id = validId(candidate.id, "CONNECTOR_ID_INVALID");
    if (ids.has(id)) throw new Error("CONNECTOR_ID_DUPLICATE");
    ids.add(id);
    if (!candidate.displayName.trim() || candidate.displayName.length > 120) {
      throw new Error("CONNECTOR_DISPLAY_NAME_INVALID");
    }
    if (candidate.protocolVersion !== "1.0") throw new Error("CONNECTOR_PROTOCOL_UNSUPPORTED");
    if (!Number.isSafeInteger(candidate.maximumTimeoutSeconds) ||
        candidate.maximumTimeoutSeconds < 1 || candidate.maximumTimeoutSeconds > 86_400) {
      throw new Error("CONNECTOR_TIMEOUT_INVALID");
    }
    const operations = [...candidate.operations];
    if (new Set(operations).size !== operations.length ||
        operations.some((operation) => !OPERATIONS.has(operation))) {
      throw new Error("CONNECTOR_OPERATIONS_INVALID");
    }
    if (!["SUBMIT", "PROGRESS", "RESULT"].every((operation) =>
      operations.includes(operation as ConnectorOperation)
    )) throw new Error("CONNECTOR_REQUIRED_OPERATION_MISSING");
    if (operations.includes("PAUSE") !== operations.includes("RESUME")) {
      throw new Error("CONNECTOR_PAUSE_RESUME_MISMATCH");
    }
    return {
      ...candidate,
      id,
      companyId: validId(candidate.companyId, "CONNECTOR_COMPANY_ID_INVALID"),
      displayName: candidate.displayName.trim(),
      operations,
      secretReferenceId: candidate.secretReferenceId
        ? validId(candidate.secretReferenceId, "CONNECTOR_SECRET_REFERENCE_INVALID")
        : null,
    };
  });
}
