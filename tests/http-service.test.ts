import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createDemoComposition } from "../adapters/demo/create-demo-composition.ts";
import { createCompanyOsHttpService } from "../adapters/http/company-os-http-service.ts";

function fixtureMaterial(label: string): string {
  return `${label}-fixture-material-`.padEnd(32, "x");
}

async function withService(
  run: (baseUrl: string) => Promise<void>,
  formalApi?: {
    getAgentBoss(request: import("node:http").IncomingMessage, companyId: string): Promise<unknown>;
    getAdministration?(request: import("node:http").IncomingMessage, companyId: string): Promise<unknown>;
    getAccountabilityLedger?(request: import("node:http").IncomingMessage, companyId: string): Promise<unknown>;
    exportAccountability?(request: import("node:http").IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    getPlanning?(request: import("node:http").IncomingMessage, companyId: string): Promise<unknown>;
    replacePlanning?(request: import("node:http").IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    createGoal?(request: import("node:http").IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    updateGoal?(request: import("node:http").IncomingMessage, companyId: string, goalId: string, input: unknown): Promise<unknown>;
    createProject?(request: import("node:http").IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    updateProject?(request: import("node:http").IncomingMessage, companyId: string, projectId: string, input: unknown): Promise<unknown>;
    archiveProject?(request: import("node:http").IncomingMessage, companyId: string, projectId: string, input: unknown): Promise<unknown>;
    dispatchWork?(request: import("node:http").IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    decideApproval?(request: import("node:http").IncomingMessage, companyId: string, requestId: string, input: unknown): Promise<unknown>;
    registerConnectorRuntime?(request: import("node:http").IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    setConnectorStatus?(request: import("node:http").IncomingMessage, companyId: string, connectorId: string, input: unknown): Promise<unknown>;
    createDataAuthorizationContract?(request: import("node:http").IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    setDataAuthorizationStatus?(request: import("node:http").IncomingMessage, companyId: string, contractId: string, input: unknown): Promise<unknown>;
    createModelRoute?(request: import("node:http").IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    setModelRouteEnabled?(request: import("node:http").IncomingMessage, companyId: string, routeId: string, input: unknown): Promise<unknown>;
    createToolProfile?(request: import("node:http").IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    bindToolProfile?(request: import("node:http").IncomingMessage, companyId: string, profileId: string, input: unknown): Promise<unknown>;
    createToolPolicy?(request: import("node:http").IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    setToolProfileStatus?(request: import("node:http").IncomingMessage, companyId: string, profileId: string, input: unknown): Promise<unknown>;
    upsertBudgetPolicy?(request: import("node:http").IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    replaceConnectorCatalog?(request: import("node:http").IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    replaceGovernanceCatalog?(request: import("node:http").IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    replaceResponsibilityContracts?(request: import("node:http").IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    transitionAgentLifecycle?(request: import("node:http").IncomingMessage, companyId: string, agentId: string, input: unknown): Promise<unknown>;
    transferResponsibility?(request: import("node:http").IncomingMessage, companyId: string, agentId: string, input: unknown): Promise<unknown>;
    exportCompany?(request: import("node:http").IncomingMessage, companyId: string): Promise<unknown>;
    beginSecretReferenceManagement?(request: import("node:http").IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    confirmSecretReferenceManagement?(request: import("node:http").IncomingMessage, companyId: string, sessionId: string): Promise<unknown>;
  },
  formalAccess?: {
    getStatus(): Promise<unknown>;
  },
  authHandler?: (request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => Promise<void>,
  formalDirectory?: {
    listCompanies(request: import("node:http").IncomingMessage): Promise<unknown>;
    claimFirstAdmin?(request: import("node:http").IncomingMessage): Promise<unknown>;
    createCompany?(request: import("node:http").IncomingMessage, input: unknown): Promise<unknown>;
    inspectCompanyRestore?(request: import("node:http").IncomingMessage, input: unknown): Promise<unknown>;
    restoreCompany?(request: import("node:http").IncomingMessage, input: unknown): Promise<unknown>;
    setupOrganization?(request: import("node:http").IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    reviseOrganization?(request: import("node:http").IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    updateCompanyProfile?(request: import("node:http").IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    archiveCompany?(request: import("node:http").IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    archiveDepartment?(request: import("node:http").IncomingMessage, companyId: string, departmentId: string, input: unknown): Promise<unknown>;
    createHumanInvite?(request: import("node:http").IncomingMessage, companyId: string, input: unknown): Promise<unknown>;
    acceptHumanInvite?(request: import("node:http").IncomingMessage, token: string): Promise<unknown>;
  },
  deploymentExposure: "private" | "public" = "private",
  operational?: Pick<
    import("../adapters/http/company-os-http-service.ts").CompanyOsHttpServiceOptions,
    "serviceMode" | "operationalReadiness" | "metricsEnabled" | "instanceMaintenance" | "releaseId" |
      "tenantAuthHandler"
      | "tenantOnboarding"
  >,
) {
  const { runtime } = createDemoComposition();
  const server = createCompanyOsHttpService({
    runtime,
    deploymentProfile: "self-hosted",
    allowedOrigins: ["http://allowed.test"],
    maxBodyBytes: 2_048,
    formalApi,
    formalAccess,
    authHandler,
    formalDirectory,
    deploymentExposure,
    ...operational,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("TEST_SERVER_ADDRESS_MISSING");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("formal portability exports a digest backup and restores only through the atomic global command", async () => {
  const calls: unknown[] = [];
  await withService(async (baseUrl) => {
    const exported = await fetch(`${baseUrl}/api/v1/companies/company-one/portability/export`);
    assert.equal(exported.status, 200);
    assert.deepEqual(await exported.json(), {
      schemaVersion: 1,
      backup: { backupVersion: 1, companyId: "company-one", digest: `sha256:${"a".repeat(64)}` },
    });
    const inspected = await fetch(`${baseUrl}/api/v1/companies/restore/inspection`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({ backup: { backupVersion: 1, companyId: "company-one" } }),
    });
    assert.equal(inspected.status, 200);
    assert.equal((await inspected.json() as { identityBinding: string }).identityBinding, "EXACT");
    const imported = await fetch(`${baseUrl}/api/v1/companies/restore`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({ backup: { backupVersion: 1, companyId: "company-one" } }),
    });
    assert.equal(imported.status, 201);
    assert.deepEqual(await imported.json(), {
      companyId: "company-one", name: "Company One", status: "active", membershipRole: "owner",
    });
    const obsolete = await fetch(`${baseUrl}/api/v1/companies/company-one/portability/import`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({ backup: { backupVersion: 1, companyId: "company-one" } }),
    });
    assert.equal(obsolete.status, 404);
    assert.deepEqual(calls, [{ operation: "inspect", backupVersion: 1 }, { operation: "restore", backupVersion: 1 }]);
  }, {
    async getAgentBoss() { return {}; },
    async exportCompany(_request, companyId) {
      assert.equal(companyId, "company-one");
      return {
        schemaVersion: 1,
        backup: { backupVersion: 1, companyId, digest: `sha256:${"a".repeat(64)}` },
      };
    },
  }, undefined, undefined, {
    async listCompanies() { return {}; },
    async inspectCompanyRestore(_request, input) {
      calls.push({ operation: "inspect", backupVersion: (input as { backup: { backupVersion: number } }).backup.backupVersion });
      return { companyId: "company-one", name: "Company One", purpose: "Purpose", locale: "en-US",
        actorUserId: "human-one", identityBinding: "EXACT", eventCount: 1, deliveredPublicationCount: 0,
        checkpointCount: 0, humanCount: 1, agentCount: 0 };
    },
    async restoreCompany(_request, input) {
      calls.push({ operation: "restore", backupVersion: (input as { backup: { backupVersion: number } }).backup.backupVersion });
      return { companyId: "company-one", name: "Company One", status: "active", membershipRole: "owner" };
    },
  });
});

test("formal company closure accepts only an exact digest-bound archive command", async () => {
  const calls: unknown[] = [];
  await withService(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/companies/company-one/archive`, {
      method: "POST", headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({ expectedStatus: "active", exportDigest: `sha256:${"a".repeat(64)}`,
        retentionPolicyId: "standard-retention", reason: "Customer requested closure" }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { status: string }).status, "archived");
    const invalid = await fetch(`${baseUrl}/api/v1/companies/company-one/archive`, {
      method: "POST", headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({ expectedStatus: "active", exportDigest: "not-a-digest",
        retentionPolicyId: "standard-retention", reason: "Close" }),
    });
    assert.equal(invalid.status, 422);
    assert.deepEqual(calls, [{ companyId: "company-one", retentionPolicyId: "standard-retention" }]);
  }, undefined, undefined, undefined, {
    async listCompanies() { return {}; },
    async archiveCompany(_request, companyId, input) {
      calls.push({ companyId, retentionPolicyId: (input as { retentionPolicyId: string }).retentionPolicyId });
      return { companyId, status: "archived" };
    },
  });
});

test("secret reference administration accepts metadata only and returns a broker handoff", async () => {
  const calls: unknown[] = [];
  await withService(async (baseUrl) => {
    const started = await fetch(`${baseUrl}/api/v1/companies/company-one/secret-reference-sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({ referenceId: "model-key", operation: "CREATE", purpose: "MODEL_PROVIDER",
        providerAdapterId: "model-provider", expectedVersion: null }),
    });
    assert.equal(started.status, 201);
    assert.equal((await started.json() as { id: string }).id, "management-session");
    const checked = await fetch(`${baseUrl}/api/v1/companies/company-one/secret-reference-sessions/management-session`);
    assert.equal(checked.status, 200);
    assert.deepEqual(await checked.json(), { status: "PENDING" });
    const rejected = await fetch(`${baseUrl}/api/v1/companies/company-one/secret-reference-sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({ referenceId: "model-key", operation: "CREATE", purpose: "MODEL_PROVIDER",
        providerAdapterId: "model-provider", expectedVersion: null, secretValue: "forbidden" }),
    });
    assert.equal(rejected.status, 422);
  }, {
    async getAgentBoss() { return {}; },
    async beginSecretReferenceManagement(_request, companyId, input) {
      calls.push({ companyId, input });
      return { id: "management-session", companyId, referenceId: "model-key", operation: "CREATE",
        managementUrl: "https://broker.example/manage/opaque", expiresAt: "2026-08-25T12:10:00.000Z" };
    },
    async confirmSecretReferenceManagement(_request, companyId, sessionId) {
      calls.push({ companyId, sessionId });
      return { status: "PENDING" };
    },
  });
  assert.equal(calls.length, 2);
  assert.doesNotMatch(JSON.stringify(calls), /secretValue|credentialValue|accessToken|privateKey/i);
});

test("accountability ledger is a tenant-bound read projection", async () => {
  await withService(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/companies/company-one/accountability-ledger`, {
      headers: { cookie: "company-os-session=opaque" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      schemaVersion: 1, companyId: "company-one", approvals: [], evidence: [],
      generatedAt: "2026-08-25T12:00:00.000Z",
    });
  }, {
    async getAgentBoss() { return {}; },
    async getAccountabilityLedger(request, companyId) {
      assert.equal(request.headers.cookie, "company-os-session=opaque");
      assert.equal(companyId, "company-one");
      return { schemaVersion: 1, companyId, approvals: [], evidence: [],
        generatedAt: "2026-08-25T12:00:00.000Z" };
    },
  });
});

test("accountability export accepts only a strict origin-checked idempotent command", async () => {
  const calls: unknown[] = [];
  await withService(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/companies/company-one/accountability-exports`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({ requestId: "audit-export-2026", purposeCode: "AUDIT_REVIEW" }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { package: { exportId: string } }).package.exportId, "export-one");

    const extraField = await fetch(`${baseUrl}/api/v1/companies/company-one/accountability-exports`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({ requestId: "audit-export-2026", purposeCode: "AUDIT_REVIEW",
        destinationUrl: "https://example.invalid/upload" }),
    });
    assert.equal(extraField.status, 422);

    const crossOrigin = await fetch(`${baseUrl}/api/v1/companies/company-one/accountability-exports`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.invalid" },
      body: JSON.stringify({ requestId: "audit-export-2026", purposeCode: "AUDIT_REVIEW" }),
    });
    assert.equal(crossOrigin.status, 403);
    assert.deepEqual(calls, [{ companyId: "company-one", requestId: "audit-export-2026",
      purposeCode: "AUDIT_REVIEW" }]);
  }, {
    async getAgentBoss() { return {}; },
    async exportAccountability(_request, companyId, input) {
      calls.push({ companyId, ...(input as object) });
      return { schemaVersion: 1, package: { exportId: "export-one" } };
    },
  });
});

test("company discovery returns only the authenticated actor membership projection", async () => {
  await withService(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/companies`, {
      headers: { cookie: "company-os-session=opaque" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      schemaVersion: 1,
      companies: [{ id: "company-one", name: "Company One", slug: "company-one", membershipRole: "owner" }],
      isInstanceAdmin: true,
    });
  }, undefined, undefined, undefined, {
    async listCompanies(request) {
      assert.equal(request.headers.cookie, "company-os-session=opaque");
      return {
        schemaVersion: 1,
        companies: [{ id: "company-one", name: "Company One", slug: "company-one", membershipRole: "owner" }],
        isInstanceAdmin: true,
      };
    },
  });

  await withService(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/companies`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: { code: "FORMAL_IDENTITY_REQUIRED", parameters: {} },
    });
  }, undefined, undefined, undefined, {
    async listCompanies() { throw new Error("FORMAL_IDENTITY_REQUIRED"); },
  });
});

test("human member directory is tenant-bound and returns a versioned identity projection", async () => {
  await withService(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/companies/company-one/human-members`, {
      headers: { cookie: "company-os-session=opaque" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      schemaVersion: 1,
      members: [{
        userId: "human-one", displayName: "Human One", email: "human@example.com",
        role: "owner", status: "active",
        createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z",
      }],
    });
    const changed = await fetch(`${baseUrl}/api/v1/companies/company-one/human-members/human-one`, {
      method: "PATCH",
      headers: { cookie: "company-os-session=opaque", "content-type": "application/json" },
      body: JSON.stringify({
        expectedRole: "owner", expectedStatus: "active", role: "admin", status: "active",
      }),
    });
    assert.equal(changed.status, 200);
    assert.equal((await changed.json() as { role: string }).role, "admin");
  }, undefined, undefined, undefined, {
    async listCompanies() { return { schemaVersion: 1, companies: [], isInstanceAdmin: false }; },
    async listHumanMembers(request, companyId) {
      assert.equal(request.headers.cookie, "company-os-session=opaque");
      assert.equal(companyId, "company-one");
      return {
        schemaVersion: 1,
        members: [{
          userId: "human-one", displayName: "Human One", email: "human@example.com",
          role: "owner", status: "active",
          createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z",
        }],
      };
    },
    async updateHumanMember(_request, companyId, userId, input) {
      assert.equal(companyId, "company-one");
      assert.equal(userId, "human-one");
      assert.deepEqual(input, {
        expectedRole: "owner", expectedStatus: "active", role: "admin", status: "active",
      });
      return {
        userId, displayName: "Human One", email: "human@example.com",
        role: "admin", status: "active",
        createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T01:00:00.000Z",
      };
    },
  });
});

test("private self-hosted bootstrap claim and owned-company creation follow the authenticated session flow", async () => {
  const calls: unknown[] = [];
  await withService(async (baseUrl) => {
    const claimed = await fetch(`${baseUrl}/api/v1/bootstrap/claim`, {
      method: "POST", headers: { origin: "http://allowed.test" },
    });
    assert.equal(claimed.status, 200);
    assert.deepEqual(await claimed.json(), { claimed: true, userId: "human-one" });

    const created = await fetch(`${baseUrl}/api/v1/companies`, {
      method: "POST",
      headers: { origin: "http://allowed.test", "content-type": "application/json" },
      body: JSON.stringify({ name: "Coral Labs", purpose: "Keep humans accountable.", locale: "en-US" }),
    });
    assert.equal(created.status, 201);
    assert.deepEqual(await created.json(), { companyId: "company-one", membershipRole: "owner" });
    const organization = await fetch(`${baseUrl}/api/v1/companies/company-one/organization`, {
      method: "POST",
      headers: { origin: "http://allowed.test", "content-type": "application/json" },
      body: JSON.stringify({ departmentName: "Operations", ownerTitle: "Founder" }),
    });
    assert.equal(organization.status, 201);
    assert.deepEqual(await organization.json(), { companyId: "company-one", ownerId: "human-one" });
    assert.deepEqual(calls, [
      { operation: "claim", session: undefined },
      { operation: "create", name: "Coral Labs" },
      { operation: "organization", companyId: "company-one", ownerTitle: "Founder" },
    ]);
  }, undefined, undefined, undefined, {
    async listCompanies() { return { schemaVersion: 1, companies: [], isInstanceAdmin: false }; },
    async claimFirstAdmin(request) {
      calls.push({ operation: "claim", session: request.headers.cookie });
      return { claimed: true, userId: "human-one" };
    },
    async createCompany(_request, input) {
      calls.push({ operation: "create", name: (input as { name: string }).name });
      return { companyId: "company-one", membershipRole: "owner" };
    },
    async setupOrganization(_request, companyId, input) {
      calls.push({ operation: "organization", companyId, ownerTitle: (input as { ownerTitle: string }).ownerTitle });
      return { companyId, ownerId: "human-one" };
    },
  });
});

test("company profile command is tenant-bound, compare-and-swap, and structurally exact", async () => {
  let received: unknown = null;
  const command = { expected: { name: "Acme", purpose: "Operate", locale: "en" },
    next: { name: "Acme Operations", purpose: "Operate safely", locale: "en-US" } };
  await withService(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/companies/company-one/profile`, {
      method: "PATCH", headers: { origin: "http://allowed.test", "content-type": "application/json" },
      body: JSON.stringify(command),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received, { companyId: "company-one", input: command });
    const invalid = await fetch(`${baseUrl}/api/v1/companies/company-one/profile`, {
      method: "PATCH", headers: { origin: "http://allowed.test", "content-type": "application/json" },
      body: JSON.stringify({ ...command, role: "owner" }),
    });
    assert.equal(invalid.status, 422);
  }, undefined, undefined, undefined, {
    async listCompanies() { return { schemaVersion: 1, companies: [], isInstanceAdmin: true }; },
    async updateCompanyProfile(_request, companyId, input) {
      received = { companyId, input }; return { company: { id: companyId } };
    },
  });
});

test("department archive route owns tenant and source while accepting one exact reassignment command", async () => {
  let received: unknown = null;
  const command = { destinationDepartmentId: "department-two", expectedResponsibilityRevision: 3,
    reason: "Consolidate teams" };
  await withService(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/companies/company-one/departments/department-one/archive`, {
      method: "POST", headers: { origin: "http://allowed.test", "content-type": "application/json" },
      body: JSON.stringify(command),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received, { companyId: "company-one", departmentId: "department-one", input: command });
    const invalid = await fetch(`${baseUrl}/api/v1/companies/company-one/departments/department-one/archive`, {
      method: "POST", headers: { origin: "http://allowed.test", "content-type": "application/json" },
      body: JSON.stringify({ ...command, deleteData: true }),
    });
    assert.equal(invalid.status, 422);
  }, undefined, undefined, undefined, {
    async listCompanies() { return { schemaVersion: 1, companies: [], isInstanceAdmin: true }; },
    async archiveDepartment(_request, companyId, departmentId, input) {
      received = { companyId, departmentId, input }; return { company: { id: companyId } };
    },
  });
});

test("formal organization revisions cross a validated server command boundary", async () => {
  let received: unknown = null;
  await withService(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/companies/company-one/organization/revisions`, {
      method: "POST",
      headers: { origin: "http://allowed.test", "content-type": "application/json" },
      body: JSON.stringify({ organization: {
        company: { id: "company-one", name: "Company One", purpose: "Operate", locale: "en" },
        departments: [{ id: "operations", name: "Operations", mandate: "Operate" }],
        humans: [{ id: "human-one", name: "Alex", title: "Owner", departmentId: "operations", avatarId: "human-default" }],
        agents: [],
      } }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { company: { id: "company-one" } });
    assert.equal((received as { organization: { humans: unknown[] } }).organization.humans.length, 1);

    const invalid = await fetch(`${baseUrl}/api/v1/companies/company-one/organization/revisions`, {
      method: "POST",
      headers: { origin: "http://allowed.test", "content-type": "application/json" },
      body: JSON.stringify({ organization: { company: {}, departments: "invalid" } }),
    });
    assert.equal(invalid.status, 422);
  }, undefined, undefined, undefined, {
    async listCompanies() { return { schemaVersion: 1, companies: [], isInstanceAdmin: true }; },
    async reviseOrganization(_request, companyId, input) {
      assert.equal(companyId, "company-one");
      received = input;
      return { company: { id: companyId } };
    },
  });
});

test("formal organization revisions expose a stable pending-Agent freeze code", async () => {
  await withService(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/companies/company-one/organization/revisions`, {
      method: "POST",
      headers: { origin: "http://allowed.test", "content-type": "application/json" },
      body: JSON.stringify({ organization: {
        company: { id: "company-one", name: "Company One", purpose: "Operate", locale: "en" },
        departments: [], humans: [], agents: [],
      } }),
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: { code: "PENDING_APPROVAL_AGENT_CONFIG_FROZEN", parameters: {} },
    });
  }, undefined, undefined, undefined, {
    async listCompanies() { return { schemaVersion: 1, companies: [], isInstanceAdmin: true }; },
    async reviseOrganization() {
      throw new Error("PENDING_APPROVAL_AGENT_CONFIG_FROZEN:agent-one:runtimeConnectorId");
    },
  });
});

test("formal organization edits cannot smuggle responsibility transfer or autonomy changes", async () => {
  for (const code of [
    "RESPONSIBILITY_TRANSFER_COMMAND_REQUIRED",
    "RESPONSIBILITY_AUTONOMY_COMMAND_REQUIRED",
  ]) {
    await withService(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/companies/company-one/organization/revisions`, {
        method: "POST",
        headers: { origin: "http://allowed.test", "content-type": "application/json" },
        body: JSON.stringify({ organization: {
          company: { id: "company-one", name: "Company One", purpose: "Operate", locale: "en" },
          departments: [], humans: [], agents: [],
        } }),
      });
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { error: { code, parameters: {} } });
    }, undefined, undefined, undefined, {
      async listCompanies() { return { schemaVersion: 1, companies: [], isInstanceAdmin: true }; },
      async reviseOrganization() { throw new Error(`${code}:agent-one`); },
    });
  }
});

test("human invite API returns a one-time token and requires an authenticated acceptance command", async () => {
  const token = "company_os_invite_0123456789abcdefghijklmnopqrstuvwxyz";
  const calls: string[] = [];
  await withService(async (baseUrl) => {
    const created = await fetch(`${baseUrl}/api/v1/companies/company-one/human-invites`, {
      method: "POST",
      headers: { origin: "http://allowed.test", "content-type": "application/json" },
      body: JSON.stringify({
        email: "jordan@example.com", departmentId: "operations",
        title: "Operations Lead", role: "operator",
      }),
    });
    assert.equal(created.status, 201);
    assert.deepEqual(await created.json(), {
      inviteId: "invite-one", token, invitePath: `/invite/${token}`,
      expiresAt: "2026-08-31T00:00:00.000Z",
    });
    const accepted = await fetch(`${baseUrl}/api/v1/human-invites/${token}/accept`, {
      method: "POST", headers: { origin: "http://allowed.test" },
    });
    assert.equal(accepted.status, 202);
    assert.deepEqual(await accepted.json(), {
      accepted: true, companyId: "company-one", membershipRole: "operator",
    });
    assert.deepEqual(calls, ["create:company-one:jordan@example.com", `accept:${token}`]);
  }, undefined, undefined, undefined, {
    async listCompanies() { return { schemaVersion: 1, companies: [], isInstanceAdmin: true }; },
    async createHumanInvite(_request, companyId, input) {
      calls.push(`create:${companyId}:${(input as { email: string }).email}`);
      return { inviteId: "invite-one", token, invitePath: `/invite/${token}`, expiresAt: "2026-08-31T00:00:00.000Z" };
    },
    async acceptHumanInvite(_request, acceptedToken) {
      calls.push(`accept:${acceptedToken}`);
      return { accepted: true, companyId: "company-one", membershipRole: "operator" };
    },
  });
});

test("formal Connector, governance, and responsibility catalogs cross revisioned PUT boundaries", async () => {
  const calls: Array<{ readonly operation: string; readonly companyId: string; readonly input: unknown }> = [];
  const connector = {
    id: "connector-one", companyId: "company-one", displayName: "Enterprise Agent",
    protocolVersion: "1.0", operations: ["SUBMIT", "PROGRESS", "RESULT"],
    maximumTimeoutSeconds: 600, executionResidency: "CUSTOMER_ENVIRONMENT",
    secretReferenceId: null, status: "ENABLED",
  };
  const contract = {
    id: "contract-one", companyId: "company-one", agentId: "agent-one",
    accountableHumanId: "human-one", backupHumanId: null, autonomyLevel: 2,
    allowedActions: ["read-knowledge"], approvalRequiredActions: [],
    escalationTimeoutSeconds: null, status: "ACTIVE",
  };
  await withService(async (baseUrl) => {
    const requests = [
      ["connector-catalog", { expectedRevision: 0, connectors: [connector] }],
      ["governance-catalog", {
        expectedRevision: 0, modelRoutingPolicies: [], dataAuthorizationContracts: [],
      }],
      ["responsibility-contracts", { expectedRevision: 1, contracts: [contract] }],
    ] as const;
    for (const [path, body] of requests) {
      const response = await fetch(`${baseUrl}/api/v1/companies/company-one/${path}`, {
        method: "PUT",
        headers: { origin: "http://allowed.test", "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 200);
    }
    assert.deepEqual(calls.map(({ operation, companyId }) => ({ operation, companyId })), [
      { operation: "connectors", companyId: "company-one" },
      { operation: "governance", companyId: "company-one" },
      { operation: "responsibility", companyId: "company-one" },
    ]);

    const invalid = await fetch(`${baseUrl}/api/v1/companies/company-one/connector-catalog`, {
      method: "PUT",
      headers: { origin: "http://allowed.test", "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision: -1, connectors: [] }),
    });
    assert.equal(invalid.status, 422);
  }, {
    async getAgentBoss() { return {}; },
    async replaceConnectorCatalog(_request, companyId, input) {
      calls.push({ operation: "connectors", companyId, input });
      return { revision: 1, connectors: [connector] };
    },
    async replaceGovernanceCatalog(_request, companyId, input) {
      calls.push({ operation: "governance", companyId, input });
      return { revision: 1, companyId, modelRoutingPolicies: [], dataAuthorizationContracts: [] };
    },
    async replaceResponsibilityContracts(_request, companyId, input) {
      calls.push({ operation: "responsibility", companyId, input });
      return { revision: 2, contracts: [contract] };
    },
  });
});

test("formal Connector runtime registration uses narrow create and status command routes", async () => {
  const calls: unknown[] = [];
  await withService(async (baseUrl) => {
    const registered = await fetch(`${baseUrl}/api/v1/companies/company-one/connectors`, {
      method: "POST", headers: { origin: "http://allowed.test", "content-type": "application/json" },
      body: JSON.stringify({ connectorId: "connector-one", executionResidency: "CUSTOMER_ENVIRONMENT",
        expectedRevision: 0 }),
    });
    assert.equal(registered.status, 201);
    const disabled = await fetch(`${baseUrl}/api/v1/companies/company-one/connectors/connector-one`, {
      method: "PATCH", headers: { origin: "http://allowed.test", "content-type": "application/json" },
      body: JSON.stringify({ status: "DISABLED", expectedRevision: 1 }),
    });
    assert.equal(disabled.status, 200);
    assert.deepEqual(calls, [
      { operation: "register", companyId: "company-one", input: { connectorId: "connector-one",
        executionResidency: "CUSTOMER_ENVIRONMENT", expectedRevision: 0 } },
      { operation: "status", companyId: "company-one", connectorId: "connector-one",
        input: { status: "DISABLED", expectedRevision: 1 } },
    ]);
  }, {
    async getAgentBoss() { return {}; },
    async registerConnectorRuntime(_request, companyId, input) {
      calls.push({ operation: "register", companyId, input }); return { revision: 1, connectors: [] };
    },
    async setConnectorStatus(_request, companyId, connectorId, input) {
      calls.push({ operation: "status", companyId, connectorId, input }); return { revision: 2, connectors: [] };
    },
  });
});

test("formal data authorization uses Paperclip-shaped create and lifecycle routes", async () => {
  const calls: unknown[] = [];
  const grant = {
    id: "finance-read", dataSourceId: "finance-warehouse", authorizedAgentIds: ["agent-one"],
    authorizedOperations: ["READ"], allowedPurposes: ["monthly-close"],
    maximumClassification: "CONFIDENTIAL", allowedExportDestinations: [],
    validUntil: "2026-09-24T12:00:00.000Z", expectedRevision: 0,
  };
  await withService(async (baseUrl) => {
    const created = await fetch(`${baseUrl}/api/v1/companies/company-one/data-authorization-contracts`, {
      method: "POST", headers: { origin: "http://allowed.test", "content-type": "application/json" },
      body: JSON.stringify(grant),
    });
    assert.equal(created.status, 201);
    const revoked = await fetch(`${baseUrl}/api/v1/companies/company-one/data-authorization-contracts/finance-read`, {
      method: "PATCH", headers: { origin: "http://allowed.test", "content-type": "application/json" },
      body: JSON.stringify({ status: "REVOKED", expectedRevision: 1 }),
    });
    assert.equal(revoked.status, 200);
    assert.deepEqual(calls, [
      { operation: "create", companyId: "company-one", input: grant },
      { operation: "status", companyId: "company-one", contractId: "finance-read",
        input: { status: "REVOKED", expectedRevision: 1 } },
    ]);
  }, {
    async getAgentBoss() { return {}; },
    async createDataAuthorizationContract(_request, companyId, input) {
      calls.push({ operation: "create", companyId, input }); return { revision: 1 };
    },
    async setDataAuthorizationStatus(_request, companyId, contractId, input) {
      calls.push({ operation: "status", companyId, contractId, input }); return { revision: 2 };
    },
  });
});

test("formal model routing uses installed-provider create and enable routes", async () => {
  const calls: unknown[] = [];
  const route = { policyId: "default-models", routeId: "route-one", providerAdapterId: "provider-one",
    modelReference: "model-one", credentialReference: "secret-one",
    allowedDataClassifications: ["PUBLIC"], residency: "LOCAL", expectedRevision: 0 };
  await withService(async (baseUrl) => {
    const created = await fetch(`${baseUrl}/api/v1/companies/company-one/model-routes`, {
      method: "POST", headers: { origin: "http://allowed.test", "content-type": "application/json" },
      body: JSON.stringify(route),
    });
    assert.equal(created.status, 201);
    const enabled = await fetch(`${baseUrl}/api/v1/companies/company-one/model-routes/route-one`, {
      method: "PATCH", headers: { origin: "http://allowed.test", "content-type": "application/json" },
      body: JSON.stringify({ enabled: true, expectedRevision: 1 }),
    });
    assert.equal(enabled.status, 200);
    assert.deepEqual(calls, [
      { operation: "create", companyId: "company-one", input: route },
      { operation: "enable", companyId: "company-one", routeId: "route-one",
        input: { enabled: true, expectedRevision: 1 } },
    ]);
  }, {
    async getAgentBoss() { return {}; },
    async createModelRoute(_request, companyId, input) {
      calls.push({ operation: "create", companyId, input }); return { revision: 1 };
    },
    async setModelRouteEnabled(_request, companyId, routeId, input) {
      calls.push({ operation: "enable", companyId, routeId, input }); return { revision: 2 };
    },
  });
});

test("formal tool access uses profile, binding, policy, and lifecycle routes", async () => {
  const calls: unknown[] = [];
  const profile = {
    profileId: "research-tools", profileKey: "research-tools", name: "Research tools",
    description: null, defaultAction: "deny", expectedRevision: 0,
    entries: [{ id: "research-entry", selectorType: "tool_name", selectorValue: "knowledge-search", effect: "include" }],
  };
  await withService(async (baseUrl) => {
    const requests = [
      ["/api/v1/companies/company-one/tool-profiles", "POST", profile, 201],
      ["/api/v1/companies/company-one/tool-profiles/research-tools/bindings", "POST",
        { bindingId: "research-agent", targetType: "agent", targetId: "agent-one", priority: 100, expectedRevision: 1 }, 201],
      ["/api/v1/companies/company-one/tool-policies", "POST", { policy: {
        id: "approve-destructive", name: "Approve destructive", description: null,
        policyType: "require_approval", priority: 10, selectors: { riskLevel: "destructive" },
      }, expectedRevision: 2 }, 201],
      ["/api/v1/companies/company-one/tool-profiles/research-tools", "PATCH",
        { status: "disabled", expectedRevision: 3 }, 200],
    ] as const;
    for (const [path, method, body, status] of requests) {
      const response = await fetch(`${baseUrl}${path}`, {
        method, headers: { origin: "http://allowed.test", "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, status);
    }
    assert.deepEqual(calls, [
      { operation: "profile", companyId: "company-one", input: profile },
      { operation: "binding", companyId: "company-one", profileId: "research-tools",
        input: { bindingId: "research-agent", targetType: "agent", targetId: "agent-one", priority: 100, expectedRevision: 1 } },
      { operation: "policy", companyId: "company-one", input: { policy: {
        id: "approve-destructive", name: "Approve destructive", description: null,
        policyType: "require_approval", priority: 10, selectors: { riskLevel: "destructive" },
      }, expectedRevision: 2 } },
      { operation: "status", companyId: "company-one", profileId: "research-tools",
        input: { status: "disabled", expectedRevision: 3 } },
    ]);
  }, {
    async getAgentBoss() { return {}; },
    async createToolProfile(_request, companyId, input) {
      calls.push({ operation: "profile", companyId, input }); return { revision: 1 };
    },
    async bindToolProfile(_request, companyId, profileId, input) {
      calls.push({ operation: "binding", companyId, profileId, input }); return { revision: 2 };
    },
    async createToolPolicy(_request, companyId, input) {
      calls.push({ operation: "policy", companyId, input }); return { revision: 3 };
    },
    async setToolProfileStatus(_request, companyId, profileId, input) {
      calls.push({ operation: "status", companyId, profileId, input }); return { revision: 4 };
    },
  });
});

test("formal budget policy uses the upstream-aligned company policy route", async () => {
  let received: unknown = null;
  const policy = { policyId: "monthly-company-budget", scopeType: "company", scopeId: "company-one",
    metric: "billed_cents", windowKind: "calendar_month_utc", amount: 10_000, warnPercent: 80,
    hardStopEnabled: true, notifyEnabled: true, isActive: true, expectedRevision: 0 };
  await withService(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/companies/company-one/budgets/policies`, {
      method: "POST", headers: { origin: "http://allowed.test", "content-type": "application/json" },
      body: JSON.stringify(policy),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received, { companyId: "company-one", input: policy });
  }, {
    async getAgentBoss() { return {}; },
    async upsertBudgetPolicy(_request, companyId, input) {
      received = { companyId, input }; return { revision: 1, policies: [], costEvents: [] };
    },
  });
});

test("formal Agent lifecycle exposes explicit Paperclip-aligned action routes", async () => {
  const calls: unknown[] = [];
  await withService(async (baseUrl) => {
    for (const action of ["approve", "pause", "resume", "clear-error", "terminate"]) {
      const response = await fetch(`${baseUrl}/api/v1/companies/company-one/agents/agent-one/${action}`, {
        method: "POST",
        headers: { origin: "http://allowed.test", "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevision: calls.length,
          ...(action === "pause" ? { pauseReason: "manual" } : {}),
        }),
      });
      assert.equal(response.status, 200);
    }
    assert.deepEqual(calls, ["APPROVE", "PAUSE", "RESUME", "CLEAR_ERROR", "TERMINATE"]);
    const invalid = await fetch(`${baseUrl}/api/v1/companies/company-one/agents/agent-one/pause`, {
      method: "POST",
      headers: { origin: "http://allowed.test", "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision: 5, pauseReason: "vacation" }),
    });
    assert.equal(invalid.status, 422);
  }, {
    async getAgentBoss() { return {}; },
    async transitionAgentLifecycle(_request, companyId, agentId, input) {
      assert.equal(companyId, "company-one");
      assert.equal(agentId, "agent-one");
      calls.push((input as { operation: string }).operation);
      return { revision: calls.length, agents: [] };
    },
  });
});

test("formal responsibility transfer is tenant and Agent bound with an exact command shape", async () => {
  let received: unknown = null;
  const command = {
    newAccountableHumanId: "human-two",
    newBackupHumanId: "human-one",
    expectedResponsibilityRevision: 7,
    reason: "Ownership moved with the operating team.",
  };
  await withService(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/companies/company-one/agents/agent-one/responsibility-transfers`, {
      method: "POST",
      headers: { origin: "http://allowed.test", "content-type": "application/json" },
      body: JSON.stringify(command),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received, { companyId: "company-one", agentId: "agent-one", input: command });

    const invalid = await fetch(`${baseUrl}/api/v1/companies/company-one/agents/agent-one/responsibility-transfers`, {
      method: "POST",
      headers: { origin: "http://allowed.test", "content-type": "application/json" },
      body: JSON.stringify({ ...command, credential: "must-never-cross-this-boundary" }),
    });
    assert.equal(invalid.status, 422);
  }, {
    async getAgentBoss() { return {}; },
    async transferResponsibility(_request, companyId, agentId, input) {
      received = { companyId, agentId, input };
      return { responsibilityRevision: 8, organization: { company: { id: companyId } } };
    },
  });
});

test("first-admin claim is undiscoverable on public exposure and rejects origin or claim races", async () => {
  let called = false;
  const directory = {
    async listCompanies() { return { schemaVersion: 1, companies: [], isInstanceAdmin: false }; },
    async claimFirstAdmin() { called = true; return { claimed: true }; },
  };
  await withService(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/bootstrap/claim`, {
      method: "POST", headers: { origin: "http://allowed.test" },
    });
    assert.equal(response.status, 404);
    assert.equal(called, false);
  }, undefined, undefined, undefined, directory, "public");

  await withService(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/bootstrap/claim`, {
      method: "POST", headers: { origin: "http://evil.test" },
    });
    assert.equal(response.status, 403);
  }, undefined, undefined, undefined, directory);

  await withService(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/bootstrap/claim`, {
      method: "POST", headers: { origin: "http://allowed.test" },
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: { code: "FIRST_ADMIN_ALREADY_CLAIMED", parameters: {} },
    });
  }, undefined, undefined, undefined, {
    ...directory,
    async claimFirstAdmin() { throw new Error("FIRST_ADMIN_ALREADY_CLAIMED"); },
  });
});

test("Better Auth exclusively owns the Paperclip-aligned /api/auth route family", async () => {
  const calls: string[] = [];
  await withService(async (baseUrl) => {
    const delegated = await fetch(`${baseUrl}/api/auth/session`);
    assert.equal(delegated.status, 202);
    assert.deepEqual(await delegated.json(), { owner: "better-auth" });
    assert.deepEqual(calls, ["/api/auth/session"]);
  }, undefined, undefined, async (request, response) => {
    calls.push(request.url ?? "");
    response.writeHead(202, { "content-type": "application/json" });
    response.end(JSON.stringify({ owner: "better-auth" }));
  });

  await withService(async (baseUrl) => {
    const unavailable = await fetch(`${baseUrl}/api/auth/session`);
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), {
      error: { code: "FORMAL_AUTH_UNAVAILABLE", parameters: {} },
    });
  });
});

test("tenant-owned sign-in and Feishu callbacks are selected before legacy auth without fallback", async () => {
  const tenantCalls: string[] = [];
  const legacyCalls: string[] = [];
  const tenantAuthHandler = async (request: import("node:http").IncomingMessage,
    response: import("node:http").ServerResponse) => {
    tenantCalls.push(request.url ?? "");
    response.writeHead(202);
    response.end();
  };
  await withService(async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/t/alpha-company/sign-in`, { method: "POST" })).status, 202);
    assert.equal((await fetch(`${baseUrl}/api/auth/oauth2/callback/feishu-binding-alpha`)).status, 202);
    assert.equal((await fetch(`${baseUrl}/api/auth/session`)).status, 203);
    assert.deepEqual(tenantCalls, [
      "/t/alpha-company/sign-in",
      "/api/auth/oauth2/callback/feishu-binding-alpha",
    ]);
    assert.deepEqual(legacyCalls, ["/api/auth/session"]);
  }, undefined, undefined, async (request, response) => {
    legacyCalls.push(request.url ?? "");
    response.writeHead(203);
    response.end();
  }, undefined, "private", { tenantAuthHandler });

  await withService(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/oauth2/callback/feishu-binding-unknown`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: { code: "TENANT_AUTH_ROUTE_NOT_FOUND", parameters: {} },
    });
  });
});

test("authenticated tenant completion route is origin-bound and accepts only a bounded locale command", async () => {
  const calls: unknown[] = [];
  await withService(async (baseUrl) => {
    const completed = await fetch(`${baseUrl}/api/v1/tenant-registrations/registration-one/complete`, {
      method: "POST",
      headers: { origin: "http://allowed.test", "content-type": "application/json" },
      body: JSON.stringify({ locale: "zh-CN" }),
    });
    assert.equal(completed.status, 200);
    assert.deepEqual(await completed.json(), { status: "COMPLETED", companyId: "company-one" });

    const completedBySlug = await fetch(
      `${baseUrl}/api/v1/tenant-registrations/by-slug/alpha-company/complete`, {
        method: "POST",
        headers: { origin: "http://allowed.test", "content-type": "application/json" },
        body: JSON.stringify({ locale: "zh-CN" }),
      },
    );
    assert.equal(completedBySlug.status, 200);
    assert.deepEqual(await completedBySlug.json(), { status: "ALREADY_COMPLETED", companyId: "company-one" });

    const invalid = await fetch(`${baseUrl}/api/v1/tenant-registrations/registration-one/complete`, {
      method: "POST",
      headers: { origin: "http://allowed.test", "content-type": "application/json" },
      body: JSON.stringify({ locale: "zh_CN", privilege: "instance-admin" }),
    });
    assert.equal(invalid.status, 422);
    const denied = await fetch(`${baseUrl}/api/v1/tenant-registrations/registration-one/complete`, {
      method: "POST",
      headers: { origin: "http://attacker.test", "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(denied.status, 403);
    assert.deepEqual(calls, [
      { registrationId: "registration-one", input: { locale: "zh-CN" } },
      { slug: "alpha-company", input: { locale: "zh-CN" } },
    ]);
  }, undefined, undefined, undefined, undefined, "private", {
    tenantOnboarding: {
      async begin() { throw new Error("UNREACHABLE"); },
      async independentHandoff() { throw new Error("UNREACHABLE"); },
      async completeBySlug(_request, slug, input) {
        calls.push({ slug, input });
        return { status: "ALREADY_COMPLETED", companyId: "company-one" };
      },
      async complete(_request, registrationId, input) {
        calls.push({ registrationId, input });
        return { status: "COMPLETED", companyId: "company-one" };
      },
    },
  });
});

test("public tenant registration requires an allowed origin, bounded exact input, and redacts secrets", async () => {
  const calls: Array<Record<string, string>> = [];
  const tenantOnboarding = {
    async begin(_request: import("node:http").IncomingMessage, input: Record<string, string>) {
      calls.push(input);
      return {
        id: "registration-one",
        slug: input.slug,
        status: "PENDING_IDENTITY",
        signInPath: `/t/${input.slug}/sign-in`,
      };
    },
    async independentHandoff() { throw new Error("UNREACHABLE"); },
    async completeBySlug() { throw new Error("UNREACHABLE"); },
    async complete() { throw new Error("UNREACHABLE"); },
  };
  await withService(async (baseUrl) => {
    const appSecret = fixtureMaterial("tenant-app");
    const response = await fetch(`${baseUrl}/api/v1/tenant-registrations`, {
      method: "POST",
      headers: { origin: "http://allowed.test", "content-type": "application/json" },
      body: JSON.stringify({
        slug: "alpha-company", companyName: "Alpha", appId: "cli_alpha", appSecret,
        inviteCode: "COS-23456-789AB-CDEFG-HJKLM",
      }),
    });
    assert.equal(response.status, 201);
    assert.doesNotMatch(await response.text(), new RegExp(appSecret));
    assert.equal(calls.length, 1);

    const missingOrigin = await fetch(`${baseUrl}/api/v1/tenant-registrations`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    });
    assert.equal(missingOrigin.status, 403);
    const extraField = await fetch(`${baseUrl}/api/v1/tenant-registrations`, {
      method: "POST",
      headers: { origin: "http://allowed.test", "content-type": "application/json" },
      body: JSON.stringify({
        slug: "alpha-company", companyName: "Alpha", appId: "cli_alpha", appSecret,
        inviteCode: "COS-23456-789AB-CDEFG-HJKLM", admin: true,
      }),
    });
    assert.equal(extraField.status, 422);
    assert.equal(calls.length, 1);
  }, undefined, undefined, undefined, undefined, "private", { tenantOnboarding });
});

test("public tenant registration returns a bounded retry contract when verification is rate limited", async () => {
  await withService(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/tenant-registrations`, {
      method: "POST",
      headers: { origin: "http://allowed.test", "content-type": "application/json" },
      body: JSON.stringify({
        slug: "alpha-company",
        companyName: "Alpha",
        appId: "cli_alpha",
        appSecret: fixtureMaterial("tenant-app"),
      }),
    });
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("retry-after"), "60");
    assert.deepEqual(await response.json(), {
      error: { code: "TENANT_SIGNUP_RATE_LIMITED", parameters: {} },
    });
  }, undefined, undefined, undefined, undefined, "private", {
    tenantOnboarding: {
      async begin() { throw new Error("TENANT_SIGNUP_RATE_LIMITED"); },
      async independentHandoff() { throw new Error("UNREACHABLE"); },
      async completeBySlug() { throw new Error("UNREACHABLE"); },
      async complete() { throw new Error("UNREACHABLE"); },
    },
  });
});

test("formal access status blocks company capabilities until enterprise OIDC is configured", async () => {
  await withService(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/access`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      schemaVersion: 1,
      mode: "FORMAL",
      deploymentProfile: "self-hosted",
      entryState: "BLOCKED",
      identityProvider: { protocol: "OIDC", configured: false },
      session: { authenticated: false },
      capabilities: {
        diagnostics: true,
        identitySettings: true,
        companyData: false,
        companyMutation: false,
        execution: false,
        approval: false,
        governance: false,
      },
      blockers: [{
        code: "FORMAL_OIDC_NOT_CONFIGURED",
        parameters: {
          missing: ["publicBaseUrl", "issuer", "discoveryUrl", "clientId", "clientSecret", "redirectUri", "sessionSigningKey", "databaseUrl"],
        },
      }],
    });
  }, undefined, {
    async getStatus() {
      return {
        schemaVersion: 1,
        mode: "FORMAL",
        deploymentProfile: "self-hosted",
        entryState: "BLOCKED",
        identityProvider: { protocol: "OIDC", configured: false },
        session: { authenticated: false },
        capabilities: {
          diagnostics: true,
          identitySettings: true,
          companyData: false,
          companyMutation: false,
          execution: false,
          approval: false,
          governance: false,
        },
        blockers: [{
          code: "FORMAL_OIDC_NOT_CONFIGURED",
          parameters: {
            missing: ["publicBaseUrl", "issuer", "discoveryUrl", "clientId", "clientSecret", "redirectUri", "sessionSigningKey", "databaseUrl"],
          },
        }],
      };
    },
  });
});

test("HTTP service exposes bounded Demo, health, and security-header contracts", async () => {
  await withService(async (baseUrl) => {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("x-content-type-options"), "nosniff");
    assert.equal(health.headers.get("x-frame-options"), "DENY");
    assert.deepEqual(await health.json(), {
      status: "ok",
      service: "company-os",
      mode: "DEMO_FIXTURE",
      deploymentProfile: "self-hosted",
      uptimeSeconds: 0,
    });

    const assigned = await fetch(`${baseUrl}/api/demo/actions`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({ action: "ASSIGN" }),
    });
    assert.equal(assigned.status, 200);
    assert.equal((await assigned.json() as { phase: string }).phase, "PLANNING");
  });
});

test("health and readiness identify an explicitly deployed immutable release", async () => {
  const releaseId = `0.1.0-rc.5-${"b".repeat(12)}`;
  await withService(async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/health`)).headers.get("x-company-os-release-id"), releaseId);
    assert.equal((await fetch(`${baseUrl}/ready`)).headers.get("x-company-os-release-id"), releaseId);
  }, undefined, undefined, undefined, undefined, "private", { releaseId });
});

test("readiness reports formal dependencies and refuses traffic when a required dependency fails", async () => {
  await withService(async (baseUrl) => {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json() as { mode: string }).mode, "FORMAL");

    const readiness = await fetch(`${baseUrl}/ready`);
    assert.equal(readiness.status, 503);
    assert.deepEqual(await readiness.json(), {
      status: "not_ready",
      service: "company-os",
      mode: "FORMAL",
      deploymentProfile: "self-hosted",
      checks: {
        configuration: { status: "pass", code: "FORMAL_CONFIGURATION_READY" },
        database: { status: "fail", code: "DATABASE_UNAVAILABLE" },
        connectorRuntime: { status: "degraded", code: "NO_CONNECTOR_RUNTIME_INSTALLED" },
      },
    });
  }, undefined, undefined, undefined, undefined, "public", {
    serviceMode: "FORMAL",
    operationalReadiness: {
      async getStatus() {
        return {
          status: "not_ready",
          checks: {
            configuration: { status: "pass", code: "FORMAL_CONFIGURATION_READY" },
            database: { status: "fail", code: "DATABASE_UNAVAILABLE" },
            connectorRuntime: { status: "degraded", code: "NO_CONNECTOR_RUNTIME_INSTALLED" },
          },
        };
      },
    },
  });
});

test("formal API returns a versioned projection and stable structured errors", async () => {
  await withService(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/companies/company-one/agent-boss`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { schemaVersion: 1, company: { id: "company-one" } });
  }, {
    async getAgentBoss(_request, companyId) {
      return { schemaVersion: 1, company: { id: companyId } };
    },
  });

  await withService(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/companies/company-one/agent-boss`);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: { code: "TENANT_MISMATCH", parameters: {} },
    });
  }, {
    async getAgentBoss() { throw new Error("TENANT_MISMATCH"); },
  });
});

test("formal API exposes a separate sanitized administration projection", async () => {
  await withService(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/companies/company-one/administration`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { schemaVersion: 1, connectorCatalog: { revision: 2 } });
  }, {
    async getAgentBoss() { return {}; },
    async getAdministration(_request, companyId) {
      assert.equal(companyId, "company-one");
      return { schemaVersion: 1, connectorCatalog: { revision: 2 } };
    },
  });
});

test("formal API exposes and revision-validates the planning catalog", async () => {
  const calls: unknown[] = [];
  await withService(async (baseUrl) => {
    const read = await fetch(`${baseUrl}/api/v1/companies/company-one/planning-catalog`);
    assert.equal(read.status, 200);
    assert.equal((await read.json() as { revision: number }).revision, 2);
    const replaced = await fetch(`${baseUrl}/api/v1/companies/company-one/planning-catalog`, {
      method: "PUT",
      headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({ expectedRevision: 2, goals: [], projects: [] }),
    });
    assert.equal(replaced.status, 200);
    assert.deepEqual(calls, [{ companyId: "company-one", expectedRevision: 2 }]);
  }, {
    async getAgentBoss() { return {}; },
    async getPlanning(_request, companyId) { return { companyId, revision: 2, goals: [], projects: [] }; },
    async replacePlanning(_request, companyId, input) {
      calls.push({ companyId, expectedRevision: (input as { expectedRevision: number }).expectedRevision });
      return { companyId, revision: 3, goals: [], projects: [] };
    },
  });
});

test("goal and project lifecycle routes derive tenant IDs and accept only bounded revisioned commands", async () => {
  const calls: { operation: string; companyId: string; recordId?: string; input: unknown }[] = [];
  await withService(async (baseUrl) => {
    const goal = await fetch(`${baseUrl}/api/v1/companies/company-one/goals`, {
      method: "POST", headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({ title: "Launch", description: null, level: "company", parentId: null,
        ownerAgentId: null, accountableHumanId: "human-one", expectedRevision: 0 }),
    });
    assert.equal(goal.status, 201);
    const goalUpdate = await fetch(`${baseUrl}/api/v1/companies/company-one/goals/goal-one`, {
      method: "PATCH", headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({ title: "Launch", description: "Evidence-backed", level: "company",
        status: "active", parentId: null, ownerAgentId: null,
        accountableHumanId: "human-one", expectedRevision: 1 }),
    });
    assert.equal(goalUpdate.status, 200);
    const project = await fetch(`${baseUrl}/api/v1/companies/company-one/projects`, {
      method: "POST", headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({ goalIds: ["goal-one"], name: "Launch program", description: null,
        leadAgentId: null, accountableHumanId: "human-one", departmentIds: ["operations"],
        targetDate: "2026-12-01", expectedRevision: 2 }),
    });
    assert.equal(project.status, 201);
    const projectUpdate = await fetch(`${baseUrl}/api/v1/companies/company-one/projects/project-one`, {
      method: "PATCH", headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({ goalIds: ["goal-one"], name: "Launch program", description: null,
        status: "planned", leadAgentId: null, accountableHumanId: "human-one",
        departmentIds: ["operations"], targetDate: null, expectedRevision: 3 }),
    });
    assert.equal(projectUpdate.status, 200);
    const archived = await fetch(`${baseUrl}/api/v1/companies/company-one/projects/project-one/archive`, {
      method: "POST", headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({ expectedRevision: 4 }),
    });
    assert.equal(archived.status, 200);
    const invalid = await fetch(`${baseUrl}/api/v1/companies/company-one/goals`, {
      method: "POST", headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({ title: "", level: "vendor-private", expectedRevision: 5 }),
    });
    assert.equal(invalid.status, 422);
  }, {
    async getAgentBoss() { return {}; },
    async createGoal(_request, companyId, input) {
      calls.push({ operation: "createGoal", companyId, input }); return { companyId, revision: 1 };
    },
    async updateGoal(_request, companyId, recordId, input) {
      calls.push({ operation: "updateGoal", companyId, recordId, input }); return { companyId, revision: 2 };
    },
    async createProject(_request, companyId, input) {
      calls.push({ operation: "createProject", companyId, input }); return { companyId, revision: 3 };
    },
    async updateProject(_request, companyId, recordId, input) {
      calls.push({ operation: "updateProject", companyId, recordId, input }); return { companyId, revision: 4 };
    },
    async archiveProject(_request, companyId, recordId, input) {
      calls.push({ operation: "archiveProject", companyId, recordId, input }); return { companyId, revision: 5 };
    },
  });
  assert.deepEqual(calls.map(({ operation, companyId, recordId }) => ({ operation, companyId, recordId })), [
    { operation: "createGoal", companyId: "company-one", recordId: undefined },
    { operation: "updateGoal", companyId: "company-one", recordId: "goal-one" },
    { operation: "createProject", companyId: "company-one", recordId: undefined },
    { operation: "updateProject", companyId: "company-one", recordId: "project-one" },
    { operation: "archiveProject", companyId: "company-one", recordId: "project-one" },
  ]);
});

test("formal work catalog exposes bounded pagination and tenant-bound details", async () => {
  const calls: unknown[] = [];
  await withService(async (baseUrl) => {
    const page = await fetch(`${baseUrl}/api/v1/companies/company-one/work?cursor=4&limit=25`);
    assert.equal(page.status, 200);
    assert.equal((await page.json() as { nextCursor: string }).nextCursor, "5");
    const item = await fetch(`${baseUrl}/api/v1/companies/company-one/work/work-one`);
    assert.equal(item.status, 200);
    assert.equal((await item.json() as { work: { id: string } }).work.id, "work-one");
    const timeline = await fetch(`${baseUrl}/api/v1/companies/company-one/work/work-one/attempts/attempt-one/events?afterSequence=7&limit=20`);
    assert.equal(timeline.status, 200);
    assert.equal((await timeline.json() as { attemptId: string }).attemptId, "attempt-one");
    const activity = await fetch(`${baseUrl}/api/v1/companies/company-one/activity?afterSequence=9&limit=30`);
    assert.equal(activity.status, 200);
    assert.equal((await activity.json() as { items: readonly unknown[] }).items.length, 0);
    const cancelled = await fetch(`${baseUrl}/api/v1/companies/company-one/work/work-one/attempts/attempt-one/cancellation`, {
      method: "POST", headers: { "content-type": "application/json", origin: "http://allowed.test" }, body: "{}",
    });
    assert.equal(cancelled.status, 202);
    const reconciled = await fetch(`${baseUrl}/api/v1/companies/company-one/work/work-one/attempts/attempt-one/reconciliation`, {
      method: "POST", headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({ resolution: "CONFIRMED_FAILED", evidenceId: "evidence-one" }),
    });
    assert.equal(reconciled.status, 200);
    const retried = await fetch(`${baseUrl}/api/v1/companies/company-one/work/work-one/attempts/attempt-one/retry`, {
      method: "POST", headers: { "content-type": "application/json", origin: "http://allowed.test" }, body: "{}",
    });
    assert.equal(retried.status, 201);
    const invalid = await fetch(`${baseUrl}/api/v1/companies/company-one/work?limit=101`);
    assert.equal(invalid.status, 422);
    assert.equal((await invalid.json() as { error: { code: string } }).error.code, "WORK_PAGE_INVALID");
    const invalidEvents = await fetch(`${baseUrl}/api/v1/companies/company-one/work/work-one/attempts/attempt-one/events?limit=101`);
    assert.equal(invalidEvents.status, 422);
    assert.equal((await invalidEvents.json() as { error: { code: string } }).error.code, "WORK_RUN_EVENT_PAGE_INVALID");
    const invalidActivity = await fetch(`${baseUrl}/api/v1/companies/company-one/activity?limit=101`);
    assert.equal(invalidActivity.status, 422);
    assert.equal((await invalidActivity.json() as { error: { code: string } }).error.code, "COMPANY_ACTIVITY_PAGE_INVALID");
  }, {
    async getAgentBoss() { return {}; },
    async listWork(_request, companyId, input) {
      calls.push(["list", companyId, input]); return { schemaVersion: 1, items: [], nextCursor: "5" };
    },
    async getWork(_request, companyId, workId) {
      calls.push(["get", companyId, workId]); return { work: { id: workId }, attempts: [] };
    },
    async getWorkRunTimeline(_request, companyId, workId, attemptId, input) {
      calls.push(["timeline", companyId, workId, attemptId, input]);
      return { schemaVersion: 1, workId, attemptId, items: [], nextSequence: null };
    },
    async getCompanyActivity(_request, companyId, input) {
      calls.push(["activity", companyId, input]);
      return { schemaVersion: 1, items: [], nextSequence: null };
    },
    async requestWorkCancellation(_request, companyId, workId, attemptId) {
      calls.push(["cancel", companyId, workId, attemptId]); return { id: attemptId, status: "CANCELLATION_REQUESTED" };
    },
    async reconcileWorkAttempt(_request, companyId, workId, attemptId, input) {
      calls.push(["reconcile", companyId, workId, attemptId, input]); return { id: attemptId, status: "FAILED" };
    },
    async retryWorkAttempt(_request, companyId, workId, attemptId) {
      calls.push(["retry", companyId, workId, attemptId]); return { id: "attempt-two", attemptNumber: 2 };
    },
  });
  assert.deepEqual(calls, [
    ["list", "company-one", { cursor: 4, limit: 25 }],
    ["get", "company-one", "work-one"],
    ["timeline", "company-one", "work-one", "attempt-one", { afterSequence: 7, limit: 20 }],
    ["activity", "company-one", { afterSequence: 9, limit: 30 }],
    ["cancel", "company-one", "work-one", "attempt-one"],
    ["reconcile", "company-one", "work-one", "attempt-one", { resolution: "CONFIRMED_FAILED", evidenceId: "evidence-one" }],
    ["retry", "company-one", "work-one", "attempt-one"],
  ]);
});

test("formal command API validates and tenant-binds accountable work and exact approval", async () => {
  const calls: unknown[] = [];
  const binding = {
    action: {
      id: "action-one",
      type: "publish-content",
      description: "Publish approved brief",
      inputDigest: "sha256:exact-input",
      risk: "HIGH",
    },
    workId: "work-one",
    responsibilityContractId: "contract-one",
    executingAgentId: "agent-one",
    accountableHumanId: "human-one",
    evidenceReferences: ["evidence-one"],
    resultReference: null,
  };
  await withService(async (baseUrl) => {
    const created = await fetch(`${baseUrl}/api/v1/companies/company-one/work`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({
        draft: {
          id: "work-one", title: "Prepare brief", goal: "Prepare an accountable brief.",
          scope: "AGENT", departmentId: "operations", projectId: null, agentId: "agent-one",
          requestedBy: "human-one", actionIds: ["read-knowledge"], parentWorkId: null,
        },
        genericGoalId: null,
        acceptance: {
          operationId: "upgrade-staging-01",
          planId: "acceptance-plan-rc4",
          authorizationReference: "acceptance:approved-rc4-01",
        },
        executionPreparation: {
          dataAccess: [{ requestId: "request-one", contractId: "data-contract-one",
            dataSourceId: "crm-one", operation: "READ", purpose: "customer-support",
            classification: "CONFIDENTIAL", destinationId: null, contentDigest: null }],
          secretLeases: [{ secretReferenceId: "connector-secret-one", expectedVersion: 2,
            reasonCode: "WORK_EXECUTION", leaseDurationSeconds: 300 }],
          modelRouting: { companyId: "company-one", policyId: "default-models",
            classification: "CONFIDENTIAL", requiredResidency: "LOCAL" },
        },
      }),
    });
    assert.equal(created.status, 201);

    const decided = await fetch(`${baseUrl}/api/v1/companies/company-one/approvals/approval-one/decisions`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({ decision: "APPROVED", expectedBinding: binding }),
    });
    assert.equal(decided.status, 200);
    assert.deepEqual(calls, [
      { operation: "dispatch", companyId: "company-one", draftCompanyId: "company-one",
        executionPreparation: {
          dataAccess: [{ requestId: "request-one", contractId: "data-contract-one",
            dataSourceId: "crm-one", operation: "READ", purpose: "customer-support",
            classification: "CONFIDENTIAL", destinationId: null, contentDigest: null }],
          secretLeases: [{ secretReferenceId: "connector-secret-one", expectedVersion: 2,
            reasonCode: "WORK_EXECUTION", leaseDurationSeconds: 300 }],
          modelRouting: { companyId: "company-one", policyId: "default-models",
            classification: "CONFIDENTIAL", requiredResidency: "LOCAL" },
        },
        acceptance: { operationId: "upgrade-staging-01", planId: "acceptance-plan-rc4",
          authorizationReference: "acceptance:approved-rc4-01" } },
      { operation: "decide", companyId: "company-one", requestId: "approval-one", binding },
    ]);
  }, {
    async getAgentBoss() { return {}; },
    async dispatchWork(_request, companyId, input) {
      calls.push({
        operation: "dispatch",
        companyId,
        draftCompanyId: (input as { draft: { companyId: string } }).draft.companyId,
        executionPreparation: (input as { executionPreparation?: unknown }).executionPreparation,
        acceptance: (input as { acceptance?: unknown }).acceptance,
      });
      return { work: { id: "work-one" } };
    },
    async decideApproval(_request, companyId, requestId, input) {
      calls.push({
        operation: "decide",
        companyId,
        requestId,
        binding: (input as { expectedBinding: unknown }).expectedBinding,
      });
      return { requestId, decision: "APPROVED" };
    },
  });
});

test("formal preparation retry reauthorizes the exact Work Attempt without a background identity", async () => {
  const calls: unknown[] = [];
  await withService(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/companies/company-one/work/work-one/attempts/attempt-one/preparation/retry`, {
      method: "POST", headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: "{}",
    });
    assert.equal(response.status, 200);
    assert.deepEqual(calls, [{ companyId: "company-one", workId: "work-one", attemptId: "attempt-one" }]);
    const invalid = await fetch(`${baseUrl}/api/v1/companies/company-one/work/work-one/attempts/attempt-one/preparation/retry`, {
      method: "POST", headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({ actorId: "human-two" }),
    });
    assert.equal(invalid.status, 422);
  }, {
    async getAgentBoss() { return {}; },
    async retryWorkExecutionPreparation(_request, companyId, workId, attemptId) {
      calls.push({ companyId, workId, attemptId });
      return { status: "PREPARED" };
    },
  });
});

test("formal command API rejects bad structure, disallowed origin, and unavailable commands", async () => {
  await withService(async (baseUrl) => {
    const invalid = await fetch(`${baseUrl}/api/v1/companies/company-one/work`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({ draft: { id: "../../escape" } }),
    });
    assert.equal(invalid.status, 422);
    assert.deepEqual(await invalid.json(), { error: { code: "INVALID_FORMAL_COMMAND", parameters: {} } });

    const forbidden = await fetch(`${baseUrl}/api/v1/companies/company-one/work`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://evil.test" },
      body: "{}",
    });
    assert.equal(forbidden.status, 403);
    assert.deepEqual(await forbidden.json(), { error: { code: "ORIGIN_NOT_ALLOWED", parameters: {} } });

    const unavailable = await fetch(`${baseUrl}/api/v1/companies/company-one/work`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({
        draft: {
          id: "work-one", title: "Prepare brief", goal: "Prepare an accountable brief.",
          scope: "AGENT", departmentId: "operations", projectId: null, agentId: "agent-one",
          requestedBy: "human-one", actionIds: ["read-knowledge"], parentWorkId: null,
        }, genericGoalId: null,
      }),
    });
    assert.equal(unavailable.status, 503);
  }, { async getAgentBoss() { return {}; } });
});

test("HTTP service fails closed for origin, input, size, and route errors", async () => {
  await withService(async (baseUrl) => {
    const forbidden = await fetch(`${baseUrl}/api/demo/actions`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://evil.test" },
      body: JSON.stringify({ action: "RESET" }),
    });
    assert.equal(forbidden.status, 403);
    assert.equal((await forbidden.json() as { error: { code: string } }).error.code, "ORIGIN_NOT_ALLOWED");

    const invalid = await fetch(`${baseUrl}/api/demo/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "EXECUTE_SHELL" }),
    });
    assert.equal(invalid.status, 422);

    const oversized = await fetch(`${baseUrl}/api/demo/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "RESET", padding: "x".repeat(4_096) }),
    });
    assert.equal(oversized.status, 413);

    const missing = await fetch(`${baseUrl}/not-found`);
    assert.equal(missing.status, 404);
    const text = await missing.text();
    assert.doesNotMatch(text, /stack|node:internal|\/Users\//i);
  });
});

test("independent Web origins receive exact credentialed CORS and bounded preflight", async () => {
  await withService(async (baseUrl) => {
    const preflight = await fetch(`${baseUrl}/api/v1/companies/company-one/work`, {
      method: "OPTIONS",
      headers: { origin: "http://allowed.test", "access-control-request-method": "POST",
        "access-control-request-headers": "content-type" },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "http://allowed.test");
    assert.equal(preflight.headers.get("access-control-allow-credentials"), "true");
    assert.equal(preflight.headers.get("vary"), "Origin");
    const read = await fetch(`${baseUrl}/health`, { headers: { origin: "http://allowed.test" } });
    assert.equal(read.headers.get("access-control-allow-origin"), "http://allowed.test");
    const denied = await fetch(`${baseUrl}/api/v1/companies`, { method: "OPTIONS",
      headers: { origin: "http://attacker.test", "access-control-request-method": "GET" } });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
  }, { async getAgentBoss() { return {}; } });
});

test("instance administrators can read and explicitly freeze dispatch through the bounded API", async () => {
  const changes: unknown[] = [];
  await withService(async (baseUrl) => {
    const current = await fetch(`${baseUrl}/api/v1/instance/maintenance`);
    assert.equal(current.status, 200);
    assert.deepEqual(await current.json(), {
      schemaVersion: 1,
      mode: "OPEN",
      revision: 0,
      operationId: null,
      authorizationReference: null,
      changedBy: null,
      changedAt: null,
    });

    const frozen = await fetch(`${baseUrl}/api/v1/instance/maintenance`, {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({
        mode: "DISPATCH_FROZEN",
        expectedRevision: 0,
        operationId: "upgrade-staging-01",
        authorizationReference: "change:approved-01",
      }),
    });
    assert.equal(frozen.status, 200);
    assert.deepEqual(await frozen.json(), { mode: "DISPATCH_FROZEN", revision: 1 });
    assert.deepEqual(changes, [{
      mode: "DISPATCH_FROZEN",
      expectedRevision: 0,
      operationId: "upgrade-staging-01",
      authorizationReference: "change:approved-01",
    }]);

    const accepting = await fetch(`${baseUrl}/api/v1/instance/maintenance`, {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({
        mode: "ACCEPTANCE_ONLY",
        expectedRevision: 1,
        operationId: "upgrade-staging-01",
        authorizationReference: "acceptance:approved-rc4-01",
        acceptance: {
          planId: "acceptance-plan-rc4",
          planDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          work: [{ companyId: "company-one", workId: "acceptance-work-oidc" }],
        },
      }),
    });
    assert.equal(accepting.status, 200);
    assert.deepEqual(changes[1], {
      mode: "ACCEPTANCE_ONLY",
      expectedRevision: 1,
      operationId: "upgrade-staging-01",
      authorizationReference: "acceptance:approved-rc4-01",
      acceptance: {
        planId: "acceptance-plan-rc4",
        planDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        work: [{ companyId: "company-one", workId: "acceptance-work-oidc" }],
      },
    });

    const invalid = await fetch(`${baseUrl}/api/v1/instance/maintenance`, {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: "http://allowed.test" },
      body: JSON.stringify({
        mode: "DISPATCH_FROZEN",
        expectedRevision: 0,
        operationId: "upgrade-staging-02",
        authorizationReference: "change:approved-02",
        unexpected: true,
      }),
    });
    assert.equal(invalid.status, 422);
    assert.deepEqual(await invalid.json(), { error: { code: "INVALID_FORMAL_COMMAND", parameters: {} } });

    const forbidden = await fetch(`${baseUrl}/api/v1/instance/maintenance`, {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: "http://evil.test" },
      body: JSON.stringify({
        mode: "OPEN",
        expectedRevision: 1,
        operationId: "upgrade-staging-01",
        authorizationReference: "change:approved-01",
      }),
    });
    assert.equal(forbidden.status, 403);
  }, undefined, undefined, undefined, undefined, "private", {
    instanceMaintenance: {
      async get() {
        return { schemaVersion: 1, mode: "OPEN", revision: 0, operationId: null,
          authorizationReference: null, changedBy: null, changedAt: null };
      },
      async change(_request, input) {
        changes.push(input);
        return { mode: "DISPATCH_FROZEN", revision: 1 };
      },
    },
  });
});

test("private operational metrics expose bounded route families without customer identifiers", async () => {
  await withService(async (baseUrl) => {
    await fetch(`${baseUrl}/health`);
    await fetch(`${baseUrl}/api/v1/companies/company-sensitive`, { headers: { origin: "http://allowed.test" } });
    const response = await fetch(`${baseUrl}/metrics`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/plain; version=0.0.4; charset=utf-8");
    const body = await response.text();
    assert.match(body, /company_os_http_requests_total/);
    assert.match(body, /route="health"/);
    assert.match(body, /route="formal_api"/);
    assert.doesNotMatch(body, /company-sensitive/);
    assert.doesNotMatch(body, /\/api\/v1\//);
  }, { async getAgentBoss() { return {}; } }, undefined, undefined, undefined, "private", {
    metricsEnabled: true,
  });
});
