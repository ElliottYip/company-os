import type { AgentExecutionPort, RuntimeProof } from "../ports/agent-execution-port.ts";
import type { AgentDescriptor, WorkRequest } from "../core/control-plane.ts";

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Connector conformance failed: ${message}`);
}

export async function runConnectorConformance(
  createConnector: () => AgentExecutionPort,
): Promise<void> {
  const connector = createConnector();
  const capabilities = await connector.capabilities();
  expect(capabilities.protocolVersion === "1.0", "protocol version must be 1.0");
  expect(capabilities.supportsPause, "pause capability is required");
  expect(capabilities.supportsResume, "resume capability is required");
  expect(capabilities.supportsCancellation, "cancellation capability is required");
  expect(capabilities.supportsEvidence, "evidence capability is required");
  expect(await connector.health() === "HEALTHY", "fixture connector must be healthy");

  const agent: AgentDescriptor = {
    id: "agent-conformance",
    companyId: "company-conformance",
    displayName: "Conformance Fixture Agent",
    runtimeConnectorId: capabilities.connectorId,
    accountableHumanId: "human-conformance",
    role: "Conformance operator",
    autonomyLevel: 1,
  };
  const deployment = await connector.deploy(agent);
  const replayedDeployment = await connector.deploy(agent);
  expect(deployment.connectorId === capabilities.connectorId, "deployment connector mismatch");
  expect(replayedDeployment.id === deployment.id, "Agent deployment must be idempotent");

  const request: WorkRequest = {
    id: "work-conformance",
    companyId: agent.companyId,
    agentId: agent.id,
    requestedBy: agent.accountableHumanId,
    goal: "Run the deterministic connector contract fixture",
    input: { reference: "fixture-input" },
    idempotencyKey: "conformance-idempotency-one",
    timeoutAt: "2026-08-18T08:05:00.000Z",
  };
  const proof: RuntimeProof = {
    proofId: "proof-conformance",
    connectorId: capabilities.connectorId,
    issuedAt: "2026-08-18T08:00:00.000Z",
    expiresAt: "2026-08-18T08:10:00.000Z",
    digest: "sha256:secret-free-runtime-attestation",
  };
  expect(
    Object.keys(proof).sort().join(",") ===
      "connectorId,digest,expiresAt,issuedAt,proofId",
    "runtime proof must remain secret-free",
  );

  const first = await connector.submit(deployment, request, proof);
  const replay = await connector.submit(deployment, request, proof);
  expect(first.executionId === replay.executionId, "submit must be idempotent");
  expect((await connector.observe(request.id)).at(-1)?.status === "WORKING", "submit status");

  await connector.pause(request.id, "conformance pause");
  expect((await connector.observe(request.id)).at(-1)?.status === "WAITING", "pause status");
  await connector.resume(request.id, "approval-conformance");
  expect((await connector.observe(request.id)).at(-1)?.status === "WORKING", "resume status");
  await connector.cancel(request.id, "conformance cancellation");
  expect((await connector.observe(request.id)).at(-1)?.status === "CANCELLED", "cancel status");
}
