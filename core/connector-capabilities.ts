import type { ConnectorOperation } from "./connector.ts";

export const CONNECTOR_DATA_CAPABILITIES = [
  "AGENT_INVENTORY",
  "IDENTITY_MAPPING",
  "USAGE",
  "SUBSCRIPTION_STATUS",
  "CREDENTIAL_STATUS",
  "OBSERVED_WORK",
  "FEDERATED_WORK",
  "ARTIFACT_REFERENCES",
  "APPROVAL_EVENTS",
  "EVIDENCE_REFERENCES",
  "RESULT_REFERENCES",
] as const;
export type ConnectorDataCapability = typeof CONNECTOR_DATA_CAPABILITIES[number];

export const CONNECTOR_CONTROL_CAPABILITIES = [
  "REGISTER_OBSERVED_WORK",
  "SYNCHRONIZE_FEDERATED_RECORDS",
  "DISPATCH_WORK",
  "OBSERVE_PROGRESS",
  "PAUSE_WORK",
  "RESUME_WORK",
  "CANCEL_WORK",
  "RECORD_RESULT",
  "CONTROL_LIFECYCLE",
] as const;
export type ConnectorControlCapability = typeof CONNECTOR_CONTROL_CAPABILITIES[number];

export interface ConnectorCapabilities {
  readonly data: readonly ConnectorDataCapability[];
  readonly control: readonly ConnectorControlCapability[];
}

const DATA = new Set<string>(CONNECTOR_DATA_CAPABILITIES);
const CONTROL = new Set<string>(CONNECTOR_CONTROL_CAPABILITIES);

function list<T extends string>(
  candidates: readonly T[],
  allowed: ReadonlySet<string>,
  code: string,
): readonly T[] {
  if (new Set(candidates).size !== candidates.length ||
      candidates.some((candidate) => !allowed.has(candidate))) {
    throw new Error(code);
  }
  return [...candidates];
}

export function validateConnectorCapabilities(
  candidate: ConnectorCapabilities,
): ConnectorCapabilities {
  const data = list(candidate.data, DATA, "CONNECTOR_DATA_CAPABILITIES_INVALID");
  const control = list(
    candidate.control,
    CONTROL,
    "CONNECTOR_CONTROL_CAPABILITIES_INVALID",
  );
  const governed = ["DISPATCH_WORK", "OBSERVE_PROGRESS", "RECORD_RESULT"] as const;
  if (governed.some((capability) => control.includes(capability)) &&
      !control.includes("RECORD_RESULT")) {
    throw new Error("CONNECTOR_GOVERNED_RESULT_CAPABILITY_REQUIRED");
  }
  if (governed.some((capability) => control.includes(capability)) &&
      !governed.every((capability) => control.includes(capability))) {
    throw new Error("CONNECTOR_GOVERNED_CAPABILITIES_INCOMPLETE");
  }
  if (control.includes("PAUSE_WORK") !== control.includes("RESUME_WORK")) {
    throw new Error("CONNECTOR_PAUSE_RESUME_MISMATCH");
  }
  if (control.includes("REGISTER_OBSERVED_WORK") && !data.includes("OBSERVED_WORK")) {
    throw new Error("CONNECTOR_OBSERVED_DATA_CAPABILITY_REQUIRED");
  }
  if (control.includes("SYNCHRONIZE_FEDERATED_RECORDS") &&
      !data.includes("FEDERATED_WORK")) {
    throw new Error("CONNECTOR_FEDERATED_DATA_CAPABILITY_REQUIRED");
  }
  return { data, control };
}

export function capabilitiesFromLegacyOperations(
  operations: readonly ConnectorOperation[],
): ConnectorCapabilities {
  const operationSet = new Set(operations);
  const data: ConnectorDataCapability[] = [];
  if (operationSet.has("EVIDENCE")) data.push("EVIDENCE_REFERENCES");
  if (operationSet.has("RESULT")) data.push("RESULT_REFERENCES");
  const control: ConnectorControlCapability[] = [];
  if (operationSet.has("SUBMIT")) control.push("DISPATCH_WORK");
  if (operationSet.has("PROGRESS")) control.push("OBSERVE_PROGRESS");
  if (operationSet.has("PAUSE")) control.push("PAUSE_WORK");
  if (operationSet.has("RESUME")) control.push("RESUME_WORK");
  if (operationSet.has("CANCEL")) control.push("CANCEL_WORK");
  if (operationSet.has("RESULT")) control.push("RECORD_RESULT");
  return validateConnectorCapabilities({ data, control });
}

