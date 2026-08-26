import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const ID = "^[a-z0-9][a-z0-9-]{0,63}$";
const DIGEST = "^sha256:[a-f0-9]{64}$";
const CODE = "^[A-Z][A-Z0-9_]{2,95}$";
const timestamp = { type: "string", format: "date-time" };
const id = { type: "string", pattern: ID };
const digest = { type: "string", pattern: DIGEST };
const code = { type: "string", pattern: CODE };
const health = { type: "string", enum: ["HEALTHY", "DEGRADED", "UNAVAILABLE"] };

const object = (properties, required = Object.keys(properties)) => ({
  type: "object", additionalProperties: false, properties, required,
});
const array = (items, maximum = 1_000) => ({ type: "array", maxItems: maximum, items });
const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
const response = (description, schema) => ({
  description,
  content: { "application/json": { schema } },
});
const jsonBody = (schema) => ({ required: true, content: { "application/json": { schema } } });
const reference = (name) => ({ $ref: `#/components/schemas/${name}` });
const pathId = (name) => ({
  name, in: "path", required: true, schema: id,
});

const commonSchemas = {
  HealthResponse: object({ status: health }),
  ErrorResponse: object({ error: object({ code, retryable: { type: "boolean" } }) }),
};

function base(title, description, protocolHeader) {
  return {
    openapi: "3.1.0",
    info: { title, version: "1.0.0", description },
    servers: [{ url: "https://customer-node.invalid", description: "Replace with the customer-owned HTTPS node origin." }],
    security: [{ bearerAuth: [] }],
    paths: {},
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
      parameters: {
        ProtocolVersion: {
          name: protocolHeader, in: "header", required: true,
          schema: { type: "string", const: "1.0" },
          description: "Company OS execution-plane protocol version.",
        },
      },
      schemas: structuredClone(commonSchemas),
    },
  };
}

function operation(summary, options = {}) {
  return {
    summary,
    operationId: options.operationId,
    parameters: [{ $ref: "#/components/parameters/ProtocolVersion" }, ...(options.parameters ?? [])],
    ...(options.requestBody ? { requestBody: options.requestBody } : {}),
    responses: {
      ...options.responses,
      "401": response("Bearer authentication failed.", reference("ErrorResponse")),
      "413": response("Bounded request or response limit exceeded.", reference("ErrorResponse")),
      "429": response("Node rate limit exceeded.", reference("ErrorResponse")),
      "500": response("Stable node failure.", reference("ErrorResponse")),
    },
  };
}

function agentNode() {
  const spec = base(
    "Company OS HTTP Agent Node",
    "Vendor-neutral Agent execution protocol. Payloads are secret-free and contain bounded references, evidence digests, and exact approval actions only.",
    "x-company-os-connector-protocol",
  );
  Object.assign(spec.components.schemas, {
    AgentDescriptor: object({ id, companyId: id, displayName: { type: "string", minLength: 1, maxLength: 160 },
      runtimeConnectorId: id, accountableHumanId: id, role: { type: "string", minLength: 1, maxLength: 160 },
      autonomyLevel: { type: "integer", minimum: 0, maximum: 5 } }),
    DeploymentRequest: object({ schemaVersion: { type: "integer", const: 1 }, agent: reference("AgentDescriptor") }),
    DeploymentResponse: object({ deploymentId: id }),
    ModelExecutionBinding: object({ policyId: id, routeId: id, providerAdapterId: id,
      modelReference: id,
      classification: { type: "string", enum: ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"] },
      residency: { type: "string", enum: ["MANAGED_CLOUD", "LOCAL"] },
      executionGrantReference: id }),
    WorkExecutionInput: object({
      actionReferences: array(id, 256), permissionReferences: array(id, 256),
      dataAuthorizationReferences: array(id, 256), governedDataReferences: array(id, 256),
      dataEvidenceReferences: array(id, 256), executionGrantReferences: array(id, 256),
      responsibilityContractId: id,
      responsibilityContractRevision: { type: "integer", minimum: 1 },
      modelBinding: reference("ModelExecutionBinding"),
    }, ["actionReferences", "permissionReferences", "dataAuthorizationReferences",
      "responsibilityContractId", "responsibilityContractRevision"]),
    WorkRequest: object({ id, companyId: id, agentId: id, requestedBy: id,
      goal: { type: "string", minLength: 1, maxLength: 4_000 },
      input: reference("WorkExecutionInput"), idempotencyKey: id, timeoutAt: timestamp }),
    RuntimeProof: object({ proofId: id, connectorId: id, issuedAt: timestamp, expiresAt: timestamp, digest }),
    WorkSubmission: object({ schemaVersion: { type: "integer", const: 1 },
      deployment: object({ id, agentId: id }), request: reference("WorkRequest"), runtimeProof: reference("RuntimeProof") }),
    WorkAccepted: object({ accepted: { type: "boolean", const: true }, executionId: id }),
    ExactAction: object({ id, type: { type: "string", minLength: 1, maxLength: 160 },
      description: { type: "string", minLength: 1, maxLength: 2_000 }, inputDigest: digest,
      risk: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] } }),
    EvidenceOutput: object({ evidenceReference: id, contentDigest: digest }),
    UsageOutput: object({ usageReference: id, biller: id,
      billingType: { type: "string", enum: ["metered_api", "subscription_included", "subscription_overage", "credits", "fixed", "unknown"] },
      costStatus: { type: "string", enum: ["reported", "unpriced"] },
      inputTokens: { type: "integer", minimum: 0 }, cachedInputTokens: { type: "integer", minimum: 0 },
      outputTokens: { type: "integer", minimum: 0 }, costCents: { type: "integer", minimum: 0 },
      occurredAt: timestamp }),
    ApprovalRequest: object({ requestId: id, action: reference("ExactAction"), expiresAt: timestamp }),
    WorkObservation: object({ workId: id, sequence: { type: "integer", minimum: 1 },
      status: { type: "string", enum: ["PENDING", "WORKING", "WAITING", "BLOCKED", "AWAITING_APPROVAL", "COMPLETED", "FAILED", "CANCELLED"] },
      summary: { type: "string", minLength: 1, maxLength: 2_000 }, evidenceRefs: array(id),
      evidenceOutputs: array(reference("EvidenceOutput")), usageOutputs: array(reference("UsageOutput"), 128), resultReference: nullable(id),
      approvalRequest: reference("ApprovalRequest"), recordedAt: timestamp },
      ["workId", "sequence", "status", "summary", "evidenceRefs", "recordedAt"]),
    ObservationResponse: object({ observations: array(reference("WorkObservation")) }),
    PauseCommand: object({ schemaVersion: { type: "integer", const: 1 }, operation: { type: "string", const: "PAUSE" },
      reason: { type: "string", minLength: 1, maxLength: 512 } }),
    ResumeCommand: object({ schemaVersion: { type: "integer", const: 1 }, operation: { type: "string", const: "RESUME" }, approvalId: id }),
    CancelCommand: object({ schemaVersion: { type: "integer", const: 1 }, operation: { type: "string", const: "CANCEL" },
      reason: { type: "string", minLength: 1, maxLength: 512 } }),
    CommandRequest: { oneOf: [reference("PauseCommand"), reference("ResumeCommand"), reference("CancelCommand")] },
    CommandAccepted: object({ accepted: { type: "boolean", const: true } }),
  });
  spec.paths = {
    "/v1/health": { get: operation("Read Agent Node health", { operationId: "agentNodeHealth", responses: { "200": response("Node health.", reference("HealthResponse")) } }) },
    "/v1/deployments": { post: operation("Create or recover an idempotent Agent deployment", { operationId: "deployAgent",
      requestBody: jsonBody(reference("DeploymentRequest")), responses: { "200": response("Existing deployment.", reference("DeploymentResponse")), "201": response("Deployment created.", reference("DeploymentResponse")) } }) },
    "/v1/work": { post: operation("Submit one idempotent Work request", { operationId: "submitWork",
      requestBody: jsonBody(reference("WorkSubmission")), responses: { "200": response("Existing accepted execution.", reference("WorkAccepted")), "202": response("Work accepted.", reference("WorkAccepted")) } }) },
    "/v1/work/{workId}/observations": { get: operation("Read ordered Work observations", { operationId: "observeWork",
      parameters: [pathId("workId")], responses: { "200": response("Complete ordered observation stream.", reference("ObservationResponse")) } }) },
    "/v1/work/{workId}/commands": { post: operation("Pause, resume, or cancel one exact Work", { operationId: "commandWork",
      parameters: [pathId("workId")], requestBody: jsonBody(reference("CommandRequest")),
      responses: { "200": response("Idempotent command accepted.", reference("CommandAccepted")), "202": response("Command accepted.", reference("CommandAccepted")) } }) },
  };
  return spec;
}

function dataNode() {
  const spec = base(
    "Company OS HTTP Data Node",
    "Customer-owned data-plane protocol. Granted responses contain references and digests, never enterprise record content.",
    "x-company-os-data-connector-protocol",
  );
  Object.assign(spec.components.schemas, {
    DataAccessRequest: object({ requestId: id, companyId: id, workId: id, agentId: id, dataSourceId: id,
      authorizationContractId: id, authorizationReceiptId: id,
      operation: { type: "string", enum: ["READ", "WRITE", "EXPORT"] },
      purpose: { type: "string", minLength: 1, maxLength: 256 },
      classification: { type: "string", enum: ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"] },
      destinationId: nullable(id), contentDigest: nullable(digest), requestedAt: timestamp }),
    DataAccessEnvelope: object({ schemaVersion: { type: "integer", const: 1 }, request: reference("DataAccessRequest") }),
    DataGranted: object({ type: { type: "string", const: "GRANTED" }, dataReference: id, evidenceReference: id, contentDigest: digest }),
    DataDenied: object({ type: { type: "string", const: "DENIED" }, policyCode: code, retryable: { type: "boolean" } }),
    DataAccessResponse: object({ result: { oneOf: [reference("DataGranted"), reference("DataDenied")] } }),
  });
  spec.paths = {
    "/v1/health": { get: operation("Read Data Node health", { operationId: "dataNodeHealth", responses: { "200": response("Node health.", reference("HealthResponse")) } }) },
    "/v1/data-access": { post: operation("Evaluate and execute governed data access", { operationId: "accessData",
      requestBody: jsonBody(reference("DataAccessEnvelope")), responses: {
        "200": response("Data access granted.", reference("DataAccessResponse")),
        "201": response("Data access granted and reference created.", reference("DataAccessResponse")),
        "403": response("Policy denied access without reading the source.", reference("DataAccessResponse")),
      } }) },
  };
  return spec;
}

function secretBroker() {
  const spec = base(
    "Company OS HTTP Secret Broker",
    "Customer-owned Secret Broker protocol. Company OS receives reference metadata, opaque leases, and browser handoffs; credential material is never a valid response field.",
    "x-company-os-secret-broker-protocol",
  );
  const purpose = { type: "string", enum: ["MODEL_PROVIDER", "DATA_CONNECTOR", "AGENT_CONNECTOR", "IDENTITY_ADAPTER"] };
  const status = { type: "string", enum: ["ACTIVE", "SUSPENDED", "REVOKED"] };
  Object.assign(spec.components.schemas, {
    SecretReference: object({ id, companyId: id, purpose, providerAdapterId: id,
      currentVersion: { type: "integer", minimum: 1 }, status }),
    SecretReferenceResponse: object({ reference: reference("SecretReference") }),
    LeaseIntent: object({ companyId: id, secretReferenceId: id, expectedVersion: { type: "integer", minimum: 1 },
      consumerId: id, workAttemptId: id, reasonCode: code, expiresAt: timestamp }),
    LeaseRequest: object({ schemaVersion: { type: "integer", const: 1 }, intent: reference("LeaseIntent"), authorizationReceiptId: id }),
    SecretLease: object({ id, secretReferenceId: id, version: { type: "integer", minimum: 1 }, consumerId: id,
      workAttemptId: id, issuedAt: timestamp, expiresAt: timestamp, attestationDigest: digest }),
    LeaseResponse: object({ lease: reference("SecretLease") }),
    RevocationRequest: object({ schemaVersion: { type: "integer", const: 1 }, reasonCode: code }),
    RevocationResponse: object({ revoked: { type: "boolean", const: true } }),
    ManagementIntent: object({ companyId: id, referenceId: id,
      operation: { type: "string", enum: ["CREATE", "ROTATE", "SUSPEND", "REVOKE"] }, purpose,
      providerAdapterId: id, expectedVersion: nullable({ type: "integer", minimum: 1 }) }),
    ManagementRequest: object({ schemaVersion: { type: "integer", const: 1 }, intent: reference("ManagementIntent"), authorizationReceiptId: id }),
    ManagementSession: object({ id, companyId: id, referenceId: id,
      operation: { type: "string", enum: ["CREATE", "ROTATE", "SUSPEND", "REVOKE"] },
      managementUrl: { type: "string", format: "uri" }, expiresAt: timestamp }),
    ManagementSessionResponse: object({ session: reference("ManagementSession") }),
    ManagementPending: object({ status: { type: "string", const: "PENDING" } }),
    ManagementFailed: object({ status: { type: "string", const: "FAILED" }, code, retryable: { type: "boolean" } }),
    ManagementCompleted: object({ status: { type: "string", const: "COMPLETED" }, reference: reference("SecretReference") }),
    ManagementResultResponse: object({ result: { oneOf: [reference("ManagementPending"), reference("ManagementFailed"), reference("ManagementCompleted")] } }),
  });
  spec.paths = {
    "/v1/health": { get: operation("Read Secret Broker health", { operationId: "secretBrokerHealth", responses: { "200": response("Broker health.", reference("HealthResponse")) } }) },
    "/v1/companies/{companyId}/references/{referenceId}": { get: operation("Read secret-free reference metadata", { operationId: "describeSecretReference",
      parameters: [pathId("companyId"), pathId("referenceId")], responses: { "200": response("Reference metadata.", reference("SecretReferenceResponse")), "404": response("Reference not found.", reference("ErrorResponse")) } }) },
    "/v1/leases": { post: operation("Issue one short-lived opaque lease", { operationId: "issueSecretLease",
      requestBody: jsonBody(reference("LeaseRequest")), responses: { "200": response("Existing idempotent lease.", reference("LeaseResponse")), "201": response("Lease issued.", reference("LeaseResponse")) } }) },
    "/v1/companies/{companyId}/leases/{leaseId}/revocations": { post: operation("Revoke one exact lease idempotently", { operationId: "revokeSecretLease",
      parameters: [pathId("companyId"), pathId("leaseId")], requestBody: jsonBody(reference("RevocationRequest")),
      responses: { "200": response("Lease already revoked.", reference("RevocationResponse")), "202": response("Revocation accepted.", reference("RevocationResponse")) } }) },
    "/v1/reference-management-sessions": { post: operation("Begin a broker-owned credential management handoff", { operationId: "beginSecretReferenceManagement",
      requestBody: jsonBody(reference("ManagementRequest")), responses: { "200": response("Existing management session.", reference("ManagementSessionResponse")), "201": response("Management session created.", reference("ManagementSessionResponse")) } }) },
    "/v1/companies/{companyId}/reference-management-sessions/{sessionId}": { get: operation("Read a secret-free management result", { operationId: "getSecretReferenceManagementResult",
      parameters: [pathId("companyId"), pathId("sessionId")], responses: { "200": response("Management result.", reference("ManagementResultResponse")) } }) },
  };
  return spec;
}

export const executionPlaneOpenApi = Object.freeze({
  agentNode: agentNode(), dataNode: dataNode(), secretBroker: secretBroker(),
});

const targets = [
  ["connectors/http-agent-node/openapi.json", executionPlaneOpenApi.agentNode],
  ["connectors/http-data-node/openapi.json", executionPlaneOpenApi.dataNode],
  ["brokers/http-secret-broker/openapi.json", executionPlaneOpenApi.secretBroker],
];

export async function synchronizeExecutionPlaneOpenApi(mode = "check") {
  for (const [path, specification] of targets) {
    const expected = `${JSON.stringify(specification, null, 2)}\n`;
    if (mode === "write") await writeFile(new URL(`../${path}`, import.meta.url), expected);
    else if (await readFile(new URL(`../${path}`, import.meta.url), "utf8") !== expected) {
      throw new Error(`EXECUTION_PLANE_OPENAPI_OUT_OF_DATE:${path}`);
    }
  }
}

const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invoked) {
  const mode = process.argv.includes("--write") ? "write" : "check";
  await synchronizeExecutionPlaneOpenApi(mode);
  process.stdout.write(`Execution-plane OpenAPI ${mode === "write" ? "generated" : "is current"}.\n`);
}
