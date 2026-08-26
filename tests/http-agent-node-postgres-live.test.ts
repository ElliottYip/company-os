import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { createHmac, randomBytes } from "node:crypto";
import test from "node:test";
import { authSessions, authUsers } from "../adapters/persistence/postgres/auth-schema.ts";
import { companies, companyMemberships } from "../adapters/persistence/postgres/company-access-schema.ts";
import { createCompanyDatabase } from "../adapters/persistence/postgres/company-database.ts";
import { PostgresEventStore } from "../adapters/persistence/postgres/postgres-event-store.ts";
import { createPostgresCompanyAccessStore } from "../adapters/persistence/postgres/postgres-company-access-store.ts";
import { EventBackedApprovalStore } from "../adapters/storage/event-backed-approval-store.ts";
import { Sha256ConnectorRuntimeSecurity } from "../adapters/connectors/sha256-connector-runtime-security.ts";
import { createCompanyAuth, resolveCompanyAuthSession } from "../adapters/identity/better-auth-instance.ts";
import { SessionCompanyIdentityAdapter } from "../adapters/identity/session-company-identity-adapter.ts";
import { createCompanyOsHttpService } from "../adapters/http/company-os-http-service.ts";
import { createDemoComposition } from "../adapters/demo/create-demo-composition.ts";
import { CollectConnectorObservations } from "../application/collect-connector-observations.ts";
import { DecideHighRiskAction } from "../application/decide-high-risk-action.ts";
import { DeliverConnectorCommands } from "../application/deliver-connector-commands.ts";
import { WorkAttemptService } from "../application/work-attempt-service.ts";
import { createAgentExecutionPort } from "../connectors/http-agent-node/index.mjs";
import { createIsolatedPostgresTestDatabase } from "./support/isolated-postgres-test-database.ts";

const connectionString = process.env.COMPANY_OS_TEST_DATABASE_URL?.trim();

const structure = {
  organization: {
    company: { id: "company-one", name: "Company One", purpose: "Operate", locale: "en-US" },
    departments: [{ id: "operations", name: "Operations", mandate: "Operate" }],
    humans: [{ id: "human-one", name: "Human One", title: "Owner", departmentId: "operations", avatarId: "human-one" }],
    agents: [{ id: "agent-one", name: "Agent One", role: "Operator", departmentId: "operations",
      accountableHumanId: "human-one", runtimeConnectorId: "http-agent-node", avatarId: "fish-one", autonomyLevel: 2 }],
  },
  projects: [], workspaces: [],
  positions: [{ id: "position-one", title: "Operator", departmentId: "operations",
    principalId: "agent-one", accountableHumanId: "human-one" }],
  reportingLines: [],
} as const;

test("live PostgreSQL and HTTP Agent Node preserve exact approval across four service compositions", {
  skip: connectionString ? false : "COMPANY_OS_TEST_DATABASE_URL is not configured",
}, async () => {
  const isolated = await createIsolatedPostgresTestDatabase(connectionString as string, "connector_approval_live");
  const observations = new Map<string, unknown[]>();
  const commands: string[] = [];
  let submitCount = 0;
  const node = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown> : null;
    const path = new URL(request.url ?? "/", "http://node.test").pathname;
    const send = (status: number, value: unknown) => {
      response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(value));
    };
    if (path === "/v1/health") return send(200, { status: "HEALTHY" });
    if (path === "/v1/deployments") return send(200, { deploymentId: "deployment-live" });
    if (path === "/v1/work") {
      submitCount += 1;
      const workId = (body?.request as { id: string }).id;
      observations.set(workId, [{ workId, sequence: 1, status: "AWAITING_APPROVAL",
        summary: "Human approval required before live-test publication", evidenceRefs: ["evidence-live"],
        evidenceOutputs: [{ evidenceReference: "evidence-live", contentDigest: `sha256:${"b".repeat(64)}` }],
        approvalRequest: { requestId: "approval-live", expiresAt: "2026-08-25T10:45:00.000Z",
          action: { id: "publish-report", type: "publish", description: "Publish the reviewed live-test report",
            inputDigest: `sha256:${"c".repeat(64)}`, risk: "HIGH" } },
        recordedAt: "2026-08-25T10:05:00.000Z" }]);
      return send(202, { accepted: true, executionId: "execution-live" });
    }
    const observationMatch = path.match(/^\/v1\/work\/([^/]+)\/observations$/);
    if (observationMatch) return send(200, { observations: observations.get(observationMatch[1] as string) ?? [] });
    const commandMatch = path.match(/^\/v1\/work\/([^/]+)\/commands$/);
    if (commandMatch) {
      const operation = body?.operation;
      if (typeof operation !== "string") return send(422, { error: { code: "INVALID_OPERATION" } });
      commands.push(operation);
      if (operation === "RESUME") observations.set(commandMatch[1] as string, [
        ...(observations.get(commandMatch[1] as string) ?? []),
        { workId: commandMatch[1], sequence: 2, status: "COMPLETED", summary: "Published after exact human approval",
          evidenceRefs: ["evidence-live", "result-live"], evidenceOutputs: [
            { evidenceReference: "evidence-live", contentDigest: `sha256:${"b".repeat(64)}` },
            { evidenceReference: "result-live", contentDigest: `sha256:${"d".repeat(64)}` },
          ], resultReference: "result-live", recordedAt: "2026-08-25T10:12:00.000Z" },
      ]);
      return send(202, { accepted: true });
    }
    return send(404, { error: { code: "NOT_FOUND" } });
  });
  node.listen(0, "127.0.0.1");
  await once(node, "listening");
  const address = node.address();
  assert.ok(address && typeof address !== "string");
  const connectorOptions = { connectorId: "http-agent-node", displayName: "Enterprise HTTP Agent Node",
    baseUrl: `http://127.0.0.1:${address.port}`, bearerToken: "synthetic-postgres-approval-token",
    allowInsecureLoopback: true, requestTimeoutMs: 2_000 };
  const port = () => createAgentExecutionPort(connectorOptions);
  const security = new Sha256ConnectorRuntimeSecurity();
  const structurePort = { async load() { return structure; } };
  let id = 0;
  const nextId = () => `postgres-approval-${++id}`;
  const sessionSecret = randomBytes(48).toString("base64url");
  const sessionToken = randomBytes(32).toString("base64url");
  const signedSession = `${sessionToken}.${createHmac("sha256", sessionSecret).update(sessionToken).digest("base64")}`;
  let database = createCompanyDatabase(isolated.connectionString);
  try {
    await database.migrate();
    const now = new Date("2026-08-25T10:00:00.000Z");
    await database.db.insert(authUsers).values({ id: "human-one", name: "Human One",
      email: "human-one@integration.invalid", emailVerified: true, image: null, createdAt: now, updatedAt: now });
    await database.db.insert(companies).values({ id: "company-one", name: "Company One", purpose: "Integration",
      locale: "en-US", defaultResponsibleUserId: "human-one", status: "active", createdAt: now, updatedAt: now });
    await database.db.insert(companyMemberships).values({ id: "membership-human-one", companyId: "company-one",
      principalType: "user", principalId: "human-one", status: "active", membershipRole: "owner",
      createdAt: now, updatedAt: now });
    await database.db.insert(authSessions).values({ id: "session-human-one", token: sessionToken, userId: "human-one",
      expiresAt: new Date(Date.now() + 60 * 60_000), createdAt: now, updatedAt: now,
      ipAddress: "127.0.0.1", userAgent: "company-os-live-admission" });
    const firstStore = new PostgresEventStore(database.db);
    const firstPort = port();
    const capabilityDigest = await security.digestCapabilities(await firstPort.capabilities());
    await firstStore.append({ id: nextId(), companyId: "company-one", type: "work.dispatched",
      occurredAt: "2026-08-25T10:00:00.000Z", actorId: "human-one", provenance: "PRODUCTION",
      payload: { work: { id: "work-live", companyId: "company-one", title: "Publish report",
        goal: "Publish reviewed live-test report", scope: "AGENT", departmentId: "operations", projectId: null,
        agentId: "agent-one", requestedBy: "human-one", actionIds: ["publish-report"], parentWorkId: null,
        accountableHumanId: "human-one", responsibilityContractId: "contract-one",
        runtimeConnectorId: "http-agent-node", status: "PENDING" } } }, 0);
    await new WorkAttemptService(firstStore).create({ draft: { id: "attempt-live", companyId: "company-one",
      workId: "work-live", agentId: "agent-one", attemptNumber: 1, idempotencyKey: "work-live-v1",
      createdAt: "2026-08-25T10:00:01.000Z", timeoutAt: "2026-08-25T11:00:00.000Z",
      authority: { responsibilityContractId: "contract-one", responsibilityContractRevision: 1,
        accountableHumanId: "human-one", actionIds: ["publish-report"], permissionIds: ["report-publish"],
        dataAuthorizationIds: ["report-data"], connectorId: "http-agent-node", connectorCapabilityDigest: capabilityDigest } },
      eventId: nextId(), publicationId: nextId(), actorId: "human-one", expectedEventSequence: 1 });
    assert.equal((await new DeliverConnectorCommands({ store: firstStore, structure: structurePort,
      executionPorts: [firstPort], runtimeSecurity: security, now: () => "2026-08-25T10:01:00.000Z", nextId })
      .execute("company-one"))[0]?.status, "DELIVERED");
    await database.close();

    database = createCompanyDatabase(isolated.connectionString);
    const secondStore = new PostgresEventStore(database.db);
    const secondPort = port();
    const secondApprovals = new EventBackedApprovalStore(secondStore, "company-one", nextId,
      () => "2026-08-25T10:05:00.000Z");
    await new CollectConnectorObservations({ store: secondStore, executionPorts: [secondPort],
      approvals: secondApprovals, nextId }).execute("company-one");
    assert.equal((await new DeliverConnectorCommands({ store: secondStore, structure: structurePort,
      executionPorts: [secondPort], runtimeSecurity: security, now: () => "2026-08-25T10:06:00.000Z", nextId })
      .execute("company-one"))[0]?.status, "DELIVERED");
    await database.close();

    database = createCompanyDatabase(isolated.connectionString);
    const thirdStore = new PostgresEventStore(database.db);
    const thirdPort = port();
    const thirdApprovals = new EventBackedApprovalStore(thirdStore, "company-one", nextId,
      () => "2026-08-25T10:08:00.000Z");
    const request = (await thirdApprovals.pending("company-one"))[0]!;
    const auth = createCompanyAuth(database.db, { baseUrl: "https://api.company.test",
      redirectUri: "https://api.company.test/api/auth/oauth2/callback/enterprise-oidc",
      issuer: "https://identity.company.test", discoveryUrl: "https://identity.company.test/.well-known/openid-configuration",
      clientId: "company-os-live-admission", clientSecret: randomBytes(32).toString("base64url"),
      sessionSecret, instanceId: "approval-live" });
    const access = createPostgresCompanyAccessStore(database.db);
    const { runtime } = createDemoComposition();
    const api = createCompanyOsHttpService({ runtime, deploymentProfile: "self-hosted", serviceMode: "FORMAL",
      deploymentExposure: "private", allowedOrigins: ["https://web.company.test"], formalApi: {
        async getAgentBoss() { return {}; },
        async decideApproval(incoming, companyId, requestId, input) {
          const session = await resolveCompanyAuthSession(auth, incoming);
          if (!session) throw new Error("FORMAL_IDENTITY_REQUIRED");
          const identity = new SessionCompanyIdentityAdapter({
            user: { id: session.user.id, displayName: session.user.name }, companyId,
            memberships: await access.listActiveHumanMemberships(session.user.id),
            permissionKeys: await access.listPermissionKeys(session.user.id, companyId),
            isInstanceAdmin: await access.isInstanceAdmin(session.user.id),
            now: () => "2026-08-25T10:08:00.000Z", nextId,
          });
          const command = input as { expectedBinding: typeof request.binding; decision: "APPROVED" | "REJECTED" };
          assert.equal(requestId, request.id);
          return new DecideHighRiskAction({ identity, approvals: thirdApprovals, events: thirdStore,
            attempts: new WorkAttemptService(thirdStore), now: () => "2026-08-25T10:08:00.000Z", nextId })
            .execute({ companyId, requestId, expectedBinding: command.expectedBinding, decision: command.decision });
        },
      } });
    api.listen(0, "127.0.0.1");
    await once(api, "listening");
    const apiAddress = api.address();
    assert.ok(apiAddress && typeof apiAddress !== "string");
    const decisionResponse = await fetch(
      `http://127.0.0.1:${apiAddress.port}/api/v1/companies/company-one/approvals/${request.id}/decisions`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://web.company.test",
          cookie: `__Secure-company-os-approval-live.session_token=${encodeURIComponent(signedSession)}` },
        body: JSON.stringify({ expectedBinding: request.binding, decision: "APPROVED" }),
      });
    const decisionBody = await decisionResponse.json();
    assert.equal(decisionResponse.status, 200, JSON.stringify(decisionBody));
    api.close();
    await once(api, "close");
    assert.equal((await new DeliverConnectorCommands({ store: thirdStore, structure: structurePort,
      executionPorts: [thirdPort], runtimeSecurity: security, now: () => "2026-08-25T10:09:00.000Z", nextId })
      .execute("company-one"))[0]?.status, "DELIVERED");
    await database.close();

    database = createCompanyDatabase(isolated.connectionString);
    const fourthStore = new PostgresEventStore(database.db);
    await new CollectConnectorObservations({ store: fourthStore, executionPorts: [port()],
      approvals: new EventBackedApprovalStore(fourthStore, "company-one", nextId,
        () => "2026-08-25T10:12:00.000Z"), nextId }).execute("company-one");
    const completed = await new WorkAttemptService(fourthStore).load("company-one", "attempt-live");
    assert.equal(completed?.status, "SUCCEEDED");
    assert.equal(completed?.resultId, "result-live");
    assert.equal(submitCount, 1);
    assert.deepEqual(commands, ["PAUSE", "RESUME"]);
    assert.equal((await fourthStore.readPendingPublications("company-one", { afterSequence: 0, limit: 10 })).length, 0);
  } finally {
    await database.close();
    node.close();
    await once(node, "close");
    await isolated.dispose();
  }
});
