export type OperationalLogRecord =
  | { readonly event: "company_os.started"; readonly level: "INFO";
      readonly deploymentProfile: "managed-cloud" | "self-hosted";
      readonly exposure: "private" | "public"; readonly port: number }
  | { readonly event: "company_os.stopped"; readonly level: "INFO";
      readonly signal: "SIGINT" | "SIGTERM" }
  | { readonly event: "company_os.connector_redrive_failed"; readonly level: "ERROR";
      readonly code: "CONNECTOR_REDRIVE_FAILED" };

/**
 * Serializes the deliberately small operations schema. Tenant, principal,
 * Work, Agent, URL, provider output and exception text have no field here, so
 * failures remain observable without turning logs into a shadow evidence store.
 */
export function operationalLogLine(record: OperationalLogRecord): string {
  if ("port" in record && (!Number.isInteger(record.port) || record.port < 1 || record.port > 65_535)) {
    throw new Error("OPERATIONAL_LOG_PORT_INVALID");
  }
  return `${JSON.stringify({ schemaVersion: 1, ...record })}\n`;
}
