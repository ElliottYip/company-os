import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createFormalApplicationClient } from "../web/application-client.ts";

function response(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  }));
}

test("formal Web client consumes only the stable Agent Boss projection", async () => {
  const calls: { readonly url: string; readonly init?: RequestInit }[] = [];
  const projection = {
    schemaVersion: 1,
    mode: "PRODUCTION",
    viewer: { actorId: "human-one", displayName: "Human One" },
    organization: {
      company: { id: "company-one", name: "Company One", purpose: "", locale: "zh-CN" },
      departments: [{ id: "operations", name: "Operations", mandate: "" }],
      projects: [],
      workspaces: [],
      humans: [{ id: "human-one", name: "Human One", title: "Agent Boss", departmentId: "operations", avatarId: "human-one" }],
      agents: [{ id: "agent-one", name: "Agent One", role: "Research", departmentId: "operations", accountableHumanId: "human-one", runtimeConnectorId: "connector-one", avatarId: "fish-one", autonomyLevel: 2 }],
    },
    responsibilities: { revision: 1, contracts: [{
      id: "contract-one", companyId: "company-one", agentId: "agent-one",
      accountableHumanId: "human-one", backupHumanId: null, autonomyLevel: 2,
      allowedActions: ["read-knowledge", "publish-content"], approvalRequiredActions: ["publish-content"],
      escalationTimeoutSeconds: null, status: "ACTIVE",
    }] },
    agentLifecycle: { revision: 1, agents: [{
      companyId: "company-one", agentId: "agent-one", status: "idle",
      pauseReason: null, pausedAt: null, errorCode: null,
      updatedAt: "2026-08-20T15:00:00.000Z",
      eligibility: {
        assignable: true, invokable: true,
        assignabilityReason: "eligible", invokabilityReason: "eligible",
        orgChainHealth: {
          status: "healthy", reason: "healthy", firstInvalidAgentId: null, pausedAncestorIds: [],
        },
      },
    }] },
    work: [{
      id: "work-one", companyId: "company-one", title: "Brief", goal: "Prepare brief",
      scope: "AGENT", departmentId: "operations", projectId: null, agentId: "agent-one",
      requestedBy: "human-one", actionIds: ["read-knowledge"], parentWorkId: null,
      accountableHumanId: "human-one", responsibilityContractId: "contract-one",
      runtimeConnectorId: "connector-one", status: "PENDING",
    }],
    attempts: [{ id: "attempt-one", workId: "work-one", status: "AWAITING_APPROVAL", attemptNumber: 1,
      evidenceReferences: ["evidence-one"], resultId: null, reconciliation: null, preparationStatus: "PREPARED" }],
    pendingApprovals: [{
      id: "approval-one", companyId: "company-one", status: "AWAITING_APPROVAL",
      requestedAt: "2026-08-20T15:00:00.000Z", expiresAt: "2026-08-20T17:00:00.000Z",
      binding: {
        action: { id: "publish-content", type: "publish-content", description: "Publish the reviewed brief",
          inputDigest: `sha256:${"a".repeat(64)}`, risk: "HIGH" }, workId: "work-one",
        responsibilityContractId: "contract-one", executingAgentId: "agent-one",
        accountableHumanId: "human-one", evidenceReferences: ["evidence-one"], resultReference: null,
      },
    }],
    generatedAt: "2026-08-20T16:00:00.000Z",
  } as const;
  const accountabilityExport = {
    schemaVersion: 1 as const,
    packageType: "COMPANY_OS_ACCOUNTABILITY_EXPORT" as const,
    exportId: "export-one",
    companyId: "company-one",
    sourceEventSequence: 12,
    exportedAt: projection.generatedAt,
    policy: {
      retentionPolicyId: "standard-retention",
      exportPolicyId: "standard-accountability-export",
      purposeCode: "AUDIT_REVIEW" as const,
    },
    approvals: [],
    evidence: [],
    responsibilities: [],
  };
  const accountabilityExportDigest = `sha256:${createHash("sha256")
    .update(JSON.stringify(accountabilityExport)).digest("hex")}`;
  const client = createFormalApplicationClient({
    baseUrl: "https://company-os.example/",
    webOrigin: "https://app.company-os.example",
    webOrigin: "https://app.company-os.example",
    companyId: "company-one",
    fetcher: async (input, init) => {
      calls.push({ url: String(input), init });
      if (String(input).endsWith("/api/v1/access")) return response({
        schemaVersion: 1,
        mode: "FORMAL",
        deploymentProfile: "self-hosted",
        entryState: "READY",
        identityProvider: { protocol: "OIDC", configured: true },
        session: { authenticated: true },
        capabilities: {
          diagnostics: true, identitySettings: true, companyData: true,
          companyMutation: true, execution: true, approval: true, governance: true,
        },
        blockers: [],
      });
      if (String(input).endsWith("/api/auth/sign-in/social")) return response({
        url: "https://identity.example.test/authorize", redirect: true,
      });
      if (String(input).endsWith("/api/auth/sign-out")) return response({ success: true });
      if (String(input).endsWith("/api/v1/bootstrap/claim")) return response({ claimed: true, userId: "human-one" });
      if (String(input).endsWith("/api/v1/companies") && init?.method === "POST") return response({
        companyId: "company-one", membershipRole: "owner",
      }, 201);
      if (String(input).endsWith("/api/v1/companies/company-one/organization") && init?.method === "POST") {
        return response({ organization: projection.organization, projects: [], workspaces: [], positions: [], reportingLines: [] }, 201);
      }
      if (String(input).endsWith("/api/v1/companies/company-one/organization/revisions") && init?.method === "POST") {
        return response(projection.organization);
      }
      if (String(input).endsWith("/api/v1/companies/company-one/profile") && init?.method === "PATCH") {
        return response(projection.organization);
      }
      if (String(input).endsWith("/api/v1/companies/company-one/departments/operations/archive") && init?.method === "POST") {
        return response(projection.organization);
      }
      if (String(input).endsWith("/api/v1/companies/company-one/human-invites") && init?.method === "POST") {
        return response({
          inviteId: "invite-one",
          token: "company_os_invite_0123456789abcdefghijklmnopqrstuvwxyz",
          invitePath: "/invite/company_os_invite_0123456789abcdefghijklmnopqrstuvwxyz",
          expiresAt: "2026-08-31T00:00:00.000Z",
        }, 201);
      }
      if (String(input).endsWith("/api/v1/companies/company-one/human-members")) return response({
        schemaVersion: 1,
        members: [{
          userId: "human-one", displayName: "Human One", email: "human@example.com",
          role: "owner", status: "active",
          createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z",
        }],
      });
      if (String(input).endsWith("/api/v1/companies/company-one/human-members/human-one") && init?.method === "PATCH") {
        return response({
          userId: "human-one", displayName: "Human One", email: "human@example.com",
          role: "admin", status: "active",
          createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T01:00:00.000Z",
        });
      }
      if (String(input).includes("/api/v1/human-invites/") && String(input).endsWith("/accept")) {
        return response({ accepted: true, companyId: "company-one", membershipRole: "operator" }, 202);
      }
      if (String(input).endsWith("/api/v1/companies")) return response({
        schemaVersion: 1,
        companies: [{ id: "company-one", name: "Company One", slug: "company-one", membershipRole: "owner" }],
        isInstanceAdmin: true,
      });
      if (String(input).endsWith("/administration")) return response({
        schemaVersion: 1, mode: "PRODUCTION", viewer: projection.viewer,
        retentionPolicyId: "standard-retention",
        connectorCatalog: { revision: 1, connectors: [] }, runtimeConnectors: [],
        secretBrokerRuntime: null,
        runtimeModelProviders: [], runtimeDataConnectors: [], runtimeFederatedSources: [],
        governance: { revision: 1, modelRoutingPolicies: [], dataAuthorizationContracts: [] },
        toolAccess: { companyId: "company-one", revision: 0, profiles: [], entries: [], bindings: [], policies: [] },
        usageBudget: { ledger: { companyId: "company-one", revision: 0, costEvents: [], policies: [] },
          policySummaries: [], totalReportedCostCents: 0, unpricedEventCount: 0 },
        egressDecisions: [], generatedAt: projection.generatedAt,
      });
      if (String(input).endsWith("/operational-risk")) return response({
        schemaVersion: 1, companyId: "company-one", traces: [], accessEdges: [],
        violations: [], alerts: [], cases: [], generatedAt: projection.generatedAt,
      });
      if (String(input).endsWith("/operational-risk-rules")) return response({
        companyId: "company-one", revision: init?.method === "PUT" ? 1 : 0,
        rules: init?.method === "PUT" ? JSON.parse(String(init.body)).rules : [],
      });
      if (String(input).endsWith("/accountability-ledger")) return response({
        schemaVersion: 1, companyId: "company-one", approvals: [], evidence: [],
        generatedAt: projection.generatedAt,
      });
      if (String(input).endsWith("/accountability-exports") && init?.method === "POST") return response({
        schemaVersion: 1,
        package: { ...accountabilityExport, digest: accountabilityExportDigest },
      });
      if (String(input).endsWith("/planning-catalog")) return response({
        companyId: "company-one", revision: init?.method === "PUT" ? 2 : 1,
        goals: [], projects: [],
      });
      if (/\/goals(?:\/[^/]+)?$/.test(String(input)) ||
          /\/projects(?:\/[^/]+)?(?:\/archive)?$/.test(String(input))) return response({
        companyId: "company-one", revision: 2, goals: [], projects: [],
      }, init?.method === "POST" ? 201 : 200);
      if (String(input).includes("/api/v1/companies/company-one/work?")) return response({
        schemaVersion: 1,
        items: [{ work: projection.work[0], attempts: projection.attempts }],
        nextCursor: null,
      });
      if (String(input).includes("/work/work-one/attempts/attempt-one/events?")) return response({
        schemaVersion: 1, workId: "work-one", attemptId: "attempt-one", nextSequence: null,
        items: [{ sequence: 3, id: "event-three", type: "connector.observation",
          occurredAt: "2026-08-20T15:30:00.000Z", actorId: "connector-one",
          summary: "Collected evidence", attributes: { connectorSequence: 1, status: "WORKING" } }],
      });
      if (String(input).includes("/api/v1/companies/company-one/activity?")) return response({
        schemaVersion: 1, nextSequence: null,
        items: [{ sequence: 1, id: "activity-one", type: "work.dispatched",
          occurredAt: "2026-08-20T15:00:00.000Z", actorId: "human-one",
          summary: "Prepare launch brief", correlationId: "work-one" }],
      });
      if (String(input).endsWith("/portability/export")) return response({
        schemaVersion: 1,
        backup: { backupVersion: 1, schemaVersion: 1, companyId: "company-one", digest: `sha256:${"b".repeat(64)}` },
      });
      if (String(input).endsWith("/api/v1/companies/restore/inspection") && init?.method === "POST") return response({
        companyId: "company-one", name: "Company One", purpose: "Purpose", locale: "en-US",
        actorUserId: "human-one", identityBinding: "EXACT", eventCount: 1,
        deliveredPublicationCount: 0, checkpointCount: 0, humanCount: 1, agentCount: 1,
      });
      if (String(input).endsWith("/api/v1/companies/restore") && init?.method === "POST") return response({
        companyId: "company-one", name: "Company One", status: "active", membershipRole: "owner",
      }, 201);
      if (String(input).endsWith("/companies/company-one/archive") && init?.method === "POST") return response({
        companyId: "company-one", status: "archived", archivedAt: "2026-08-25T12:00:00.000Z",
      });
      if (String(input).endsWith("/secret-reference-sessions") && init?.method === "POST") return response({
        id: "management-session", companyId: "company-one", referenceId: "model-key", operation: "CREATE",
        managementUrl: "https://broker.example/manage/opaque", expiresAt: "2026-08-25T12:10:00.000Z",
      }, 201);
      if (String(input).endsWith("/secret-reference-sessions/management-session")) return response({
        status: "COMPLETED", reference: { id: "model-key", companyId: "company-one",
          purpose: "MODEL_PROVIDER", providerAdapterId: "model-provider", currentVersion: 1, status: "ACTIVE" },
      });
      return init?.method === "POST" ? response({ ok: true }) : response(projection);
    },
  });

  assert.equal(client.mode, "FORMAL");
  assert.equal((await client.formalAccess()).entryState, "READY");
  assert.equal(await client.beginFormalSignIn(), "https://identity.example.test/authorize");
  const signIn = calls.find(({ url }) => url.endsWith("/api/auth/sign-in/social"));
  assert.ok(signIn);
  assert.deepEqual(JSON.parse(String(signIn.init?.body)), {
    provider: "enterprise-oidc",
    callbackURL: "https://app.company-os.example/",
  });
  await client.signOut();
  assert.deepEqual(await client.companies(), {
    schemaVersion: 1,
    companies: [{ id: "company-one", name: "Company One", slug: "company-one", membershipRole: "owner" }],
    isInstanceAdmin: true,
  });
  await client.claimFirstAdmin();
  assert.equal(await client.createCompany({
    name: "Company One", purpose: "Keep humans accountable.", locale: "en-US",
  }), "company-one");
  client.selectCompany("company-one");
  await client.setupOrganization({ departmentName: "Operations", ownerTitle: "Founder" });
  const invite = await client.inviteHuman({
    email: "jordan@example.com", departmentId: "operations", title: "Lead", role: "operator",
  });
  assert.equal(invite.inviteId, "invite-one");
  assert.deepEqual((await client.humanMembers()).members.map(({ userId, role }) => ({ userId, role })), [
    { userId: "human-one", role: "owner" },
  ]);
  assert.equal((await client.updateHumanMember("human-one", {
    expectedRole: "owner", expectedStatus: "active", role: "admin", status: "active",
  })).role, "admin");
  assert.deepEqual(await client.acceptHumanInvite(invite.token), {
    accepted: true, companyId: "company-one", membershipRole: "operator",
  });
  assert.equal((await client.replaceOrganization(projection.organization)).company.id, "company-one");
  assert.equal((await client.updateCompanyProfile({
    expected: { name: "Company One", purpose: "", locale: "zh-CN" },
    next: { name: "Company One Global", purpose: "Accountable operations", locale: "en-US" },
  })).company.id, "company-one");
  const organizationRevision = calls.find(({ url }) => url.endsWith("/organization/revisions"));
  assert.deepEqual(JSON.parse(String(organizationRevision?.init?.body)), { organization: projection.organization });
  const companyProfilePatch = calls.find(({ url, init }) => url.endsWith("/profile") && init?.method === "PATCH");
  assert.deepEqual(JSON.parse(String(companyProfilePatch?.init?.body)), {
    expected: { name: "Company One", purpose: "", locale: "zh-CN" },
    next: { name: "Company One Global", purpose: "Accountable operations", locale: "en-US" },
  });
  assert.equal((await client.organization()).company.name, "Company One");
  const state = await client.snapshot();
  assert.equal(state.mode, "PRODUCTION");
  assert.equal(state.phase, "AWAITING_APPROVAL");
  assert.equal(state.responsibility.accountableHumanId, "human-one");
  assert.deepEqual(state.responsibility.approvalIds, ["approval-one"]);
  assert.deepEqual(state.responsibility.evidenceIds, ["evidence-one"]);
  const options = await client.assignmentOptions();
  assert.equal(options.viewerId, "human-one");
  assert.deepEqual(options.agents[0]?.allowedActionIds, ["read-knowledge", "publish-content"]);
  assert.equal((await client.administration())?.governance.revision, 1);
  assert.equal((await client.operationalRisk())?.companyId, "company-one");
  await client.manageAiCase("case-one", { operation: "START_INVESTIGATION", expectedRevision: 0,
    reason: "Inspect access path" });
  const caseCommand = calls.find(({ url }) => url.endsWith("/ai-cases/case-one/actions/start-investigation"));
  assert.deepEqual(JSON.parse(String(caseCommand?.init?.body)), {
    expectedRevision: 0, reason: "Inspect access path",
  });
  assert.equal((await client.operationalRiskRules())?.revision, 0);
  assert.equal((await client.replaceOperationalRiskRules({ expectedRevision: 0, rules: [{ id: "block-export",
    resourceType: "DATA", resourceId: "supplier-data", operation: "EXPORT", severity: "CRITICAL",
    summary: "Block export" }] })).revision, 1);
  assert.equal((await client.accountabilityLedger())?.companyId, "company-one");
  const planning = await client.planning();
  assert.equal(planning.revision, 1);
  assert.equal((await client.replacePlanning(planning)).revision, 2);
  assert.equal((await client.createGoal({
    title: "Launch", description: null, level: "company", parentId: null,
    ownerAgentId: null, accountableHumanId: "human-one", expectedRevision: 1,
  })).revision, 2);
  assert.equal((await client.updateGoal("goal-one", {
    title: "Launch", description: null, level: "company", status: "active",
    parentId: null, ownerAgentId: null, accountableHumanId: "human-one", expectedRevision: 2,
  })).revision, 2);
  assert.equal((await client.createProject({
    goalIds: ["goal-one"], name: "Launch program", description: null,
    leadAgentId: null, accountableHumanId: "human-one", departmentIds: ["operations"],
    targetDate: null, expectedRevision: 3,
  })).revision, 2);
  assert.equal((await client.updateProject("project-one", {
    goalIds: ["goal-one"], name: "Launch program", description: null, status: "planned",
    leadAgentId: null, accountableHumanId: "human-one", departmentIds: ["operations"],
    targetDate: null, expectedRevision: 4,
  })).revision, 2);
  assert.equal((await client.archiveProject("project-one", 5)).revision, 2);
  assert.equal((await client.workCatalog()).items[0]?.work.id, "work-one");
  assert.equal((await client.workRunTimeline("work-one", "attempt-one")).items[0]?.summary, "Collected evidence");
  assert.equal((await client.activity()).items[0]?.summary, "Prepare launch brief");
  await client.requestWorkCancellation("work-one", "attempt-one");
  await client.reconcileWorkAttempt("work-one", "attempt-one", { resolution: "CONFIRMED_FAILED", evidenceId: "evidence-one" });
  await client.retryWorkAttempt("work-one", "attempt-one");
  await client.retryWorkExecutionPreparation("work-one", "attempt-one");
  const managementSession = await client.beginSecretReferenceManagement({ referenceId: "model-key",
    operation: "CREATE", purpose: "MODEL_PROVIDER", providerAdapterId: "model-provider", expectedVersion: null });
  assert.equal(managementSession.id, "management-session");
  assert.equal((await client.confirmSecretReferenceManagement(managementSession.id)).status, "COMPLETED");
  const managementCall = calls.find(({ url, init }) =>
    url.endsWith("/secret-reference-sessions") && init?.method === "POST");
  assert.doesNotMatch(String(managementCall?.init?.body), /secretValue|credentialValue|accessToken|privateKey/i);
  await client.replaceConnectorCatalog({
    expectedRevision: 1,
    connectors: [{
      id: "connector-one", companyId: "company-one", displayName: "Enterprise Agent",
      protocolVersion: "1.0", operations: ["SUBMIT", "PROGRESS", "RESULT"],
      maximumTimeoutSeconds: 600, executionResidency: "CUSTOMER_ENVIRONMENT",
      secretReferenceId: null, status: "ENABLED",
    }],
  });
  await client.registerConnectorRuntime({ connectorId: "connector-two",
    executionResidency: "CUSTOMER_ENVIRONMENT", expectedRevision: 2 });
  await client.setConnectorStatus("connector-one", { status: "DISABLED", expectedRevision: 3 });
  await client.changeAgentRuntimeBinding("agent-one", { operation: "BIND", connectorId: "connector-two",
    expectedRevision: 0, reason: "Attach the approved local runtime." });
  await client.createDataAuthorizationContract({
    id: "finance-read", dataSourceId: "finance-warehouse", authorizedAgentIds: ["agent-one"],
    authorizedOperations: ["READ"], allowedPurposes: ["monthly-close"],
    maximumClassification: "CONFIDENTIAL", allowedExportDestinations: [],
    validUntil: "2026-09-24T12:00:00.000Z", expectedRevision: 1,
  });
  await client.setDataAuthorizationStatus("finance-read", { status: "SUSPENDED", expectedRevision: 2 });
  await client.createModelRoute({ policyId: "default-models", routeId: "route-one",
    providerAdapterId: "provider-one", modelReference: "model-one", credentialReference: "secret-one",
    allowedDataClassifications: ["PUBLIC"], residency: "LOCAL", expectedRevision: 3 });
  await client.setModelRouteEnabled("route-one", { enabled: true, expectedRevision: 4 });
  await client.createToolProfile({
    profileId: "research-tools", profileKey: "research-tools", name: "Research tools",
    description: null, defaultAction: "deny", expectedRevision: 0,
    entries: [{ id: "research-entry", selectorType: "tool_name", selectorValue: "knowledge-search", effect: "include" }],
  });
  await client.bindToolProfile("research-tools", {
    bindingId: "research-agent", targetType: "agent", targetId: "agent-one",
    priority: 100, expectedRevision: 1,
  });
  await client.createToolPolicy({ policy: {
    id: "approve-destructive", name: "Approve destructive", description: null,
    policyType: "require_approval", priority: 10, selectors: { riskLevel: "destructive" },
  }, expectedRevision: 2 });
  await client.setToolProfileStatus("research-tools", { status: "disabled", expectedRevision: 3 });
  await client.upsertBudgetPolicy({ policyId: "monthly-company-budget", scopeType: "company",
    scopeId: "company-one", metric: "billed_cents", windowKind: "calendar_month_utc",
    amount: 10_000, warnPercent: 80, hardStopEnabled: true, notifyEnabled: true,
    isActive: true, expectedRevision: 0 });
  await client.replaceGovernanceCatalog({
    expectedRevision: 1, modelRoutingPolicies: [], dataAuthorizationContracts: [],
  });
  await client.replaceResponsibilityContracts({
    expectedRevision: 1, contracts: projection.responsibilities.contracts,
  });
  await client.transferResponsibility("agent-one", {
    newAccountableHumanId: "human-two", newBackupHumanId: "human-one",
    expectedResponsibilityRevision: 1, reason: "Move ownership to Operations.",
  });
  await client.archiveDepartment("operations", {
    destinationDepartmentId: "finance", expectedResponsibilityRevision: 1,
    reason: "Consolidate operating teams.",
  });
  const connectorPut = calls.find(({ url, init }) => url.endsWith("/connector-catalog") && init?.method === "PUT");
  const connectorPost = calls.find(({ url, init }) => url.endsWith("/connectors") && init?.method === "POST");
  const connectorPatch = calls.find(({ url, init }) => url.endsWith("/connectors/connector-one") && init?.method === "PATCH");
  const runtimeBindingPost = calls.find(({ url, init }) =>
    url.endsWith("/agents/agent-one/runtime-binding") && init?.method === "POST");
  const dataPost = calls.find(({ url, init }) => url.endsWith("/data-authorization-contracts") && init?.method === "POST");
  const dataPatch = calls.find(({ url, init }) => url.endsWith("/data-authorization-contracts/finance-read") && init?.method === "PATCH");
  const modelPost = calls.find(({ url, init }) => url.endsWith("/model-routes") && init?.method === "POST");
  const modelPatch = calls.find(({ url, init }) => url.endsWith("/model-routes/route-one") && init?.method === "PATCH");
  const toolProfilePost = calls.find(({ url, init }) => url.endsWith("/tool-profiles") && init?.method === "POST");
  const toolBindingPost = calls.find(({ url, init }) => url.endsWith("/tool-profiles/research-tools/bindings") && init?.method === "POST");
  const toolPolicyPost = calls.find(({ url, init }) => url.endsWith("/tool-policies") && init?.method === "POST");
  const toolProfilePatch = calls.find(({ url, init }) => url.endsWith("/tool-profiles/research-tools") && init?.method === "PATCH");
  const budgetPost = calls.find(({ url, init }) => url.endsWith("/budgets/policies") && init?.method === "POST");
  const cancellationPost = calls.find(({ url, init }) => url.endsWith("/work/work-one/attempts/attempt-one/cancellation") && init?.method === "POST");
  const timelineGet = calls.find(({ url }) => url.includes("/work/work-one/attempts/attempt-one/events?afterSequence=0&limit=100"));
  const activityGet = calls.find(({ url }) => url.includes("/activity?afterSequence=0&limit=100"));
  const reconciliationPost = calls.find(({ url, init }) => url.endsWith("/work/work-one/attempts/attempt-one/reconciliation") && init?.method === "POST");
  const retryPost = calls.find(({ url, init }) => url.endsWith("/work/work-one/attempts/attempt-one/retry") && init?.method === "POST");
  const preparationRetryPost = calls.find(({ url, init }) =>
    url.endsWith("/work/work-one/attempts/attempt-one/preparation/retry") && init?.method === "POST");
  const governancePut = calls.find(({ url, init }) => url.endsWith("/governance-catalog") && init?.method === "PUT");
  const responsibilityPut = calls.find(({ url, init }) => url.endsWith("/responsibility-contracts") && init?.method === "PUT");
  const responsibilityTransferPost = calls.find(({ url, init }) =>
    url.endsWith("/agents/agent-one/responsibility-transfers") && init?.method === "POST");
  const departmentArchivePost = calls.find(({ url, init }) =>
    url.endsWith("/departments/operations/archive") && init?.method === "POST");
  assert.ok(connectorPut);
  assert.ok(connectorPost);
  assert.ok(connectorPatch);
  assert.ok(runtimeBindingPost);
  assert.ok(dataPost);
  assert.ok(dataPatch);
  assert.ok(modelPost);
  assert.ok(modelPatch);
  assert.ok(toolProfilePost);
  assert.ok(toolBindingPost);
  assert.ok(toolPolicyPost);
  assert.ok(toolProfilePatch);
  assert.ok(budgetPost);
  assert.ok(cancellationPost);
  assert.ok(timelineGet);
  assert.ok(activityGet);
  assert.ok(calls.every(({ url }) => url.startsWith("https://company-os.example/")),
    "every formal request must target the configured API origin");
  assert.ok(calls.every(({ init }) => init?.credentials === "include"));
  assert.ok(reconciliationPost);
  assert.ok(retryPost);
  assert.ok(preparationRetryPost);
  assert.ok(governancePut);
  assert.ok(responsibilityPut);
  assert.ok(responsibilityTransferPost);
  assert.ok(departmentArchivePost);
  assert.equal(JSON.parse(String(connectorPut.init?.body)).expectedRevision, 1);
  assert.equal(JSON.parse(String(connectorPost.init?.body)).connectorId, "connector-two");
  assert.equal(JSON.parse(String(connectorPatch.init?.body)).status, "DISABLED");
  assert.deepEqual(JSON.parse(String(runtimeBindingPost.init?.body)), {
    operation: "BIND", connectorId: "connector-two", expectedRevision: 0,
    reason: "Attach the approved local runtime.",
  });
  assert.equal(JSON.parse(String(dataPost.init?.body)).dataSourceId, "finance-warehouse");
  assert.equal(JSON.parse(String(dataPatch.init?.body)).status, "SUSPENDED");
  assert.equal(JSON.parse(String(modelPost.init?.body)).providerAdapterId, "provider-one");
  assert.equal(JSON.parse(String(modelPatch.init?.body)).enabled, true);
  assert.equal(JSON.parse(String(toolProfilePost.init?.body)).defaultAction, "deny");
  assert.equal(JSON.parse(String(toolBindingPost.init?.body)).targetType, "agent");
  assert.equal(JSON.parse(String(toolPolicyPost.init?.body)).policy.policyType, "require_approval");
  assert.equal(JSON.parse(String(toolProfilePatch.init?.body)).status, "disabled");
  assert.equal(JSON.parse(String(budgetPost.init?.body)).amount, 10_000);
  assert.equal(JSON.parse(String(governancePut.init?.body)).expectedRevision, 1);
  assert.equal(JSON.parse(String(responsibilityPut.init?.body)).contracts[0].status, "ACTIVE");
  assert.deepEqual(JSON.parse(String(responsibilityTransferPost.init?.body)), {
    newAccountableHumanId: "human-two", newBackupHumanId: "human-one",
    expectedResponsibilityRevision: 1, reason: "Move ownership to Operations.",
  });
  assert.deepEqual(JSON.parse(String(departmentArchivePost.init?.body)), {
    destinationDepartmentId: "finance", expectedResponsibilityRevision: 1,
    reason: "Consolidate operating teams.",
  });
  await client.transitionAgentLifecycle("agent-one", {
    operation: "PAUSE", expectedRevision: 1, pauseReason: "manual",
  });
  const pauseCommand = calls.find(({ url, init }) => url.endsWith("/agents/agent-one/pause") && init?.method === "POST");
  assert.ok(pauseCommand);
  assert.deepEqual(JSON.parse(String(pauseCommand.init?.body)), {
    expectedRevision: 1, pauseReason: "manual",
  });

  const backup = await client.exportCompany();
  assert.match(backup, /"backupVersion": 1/);
  const accountabilityPackage = await client.exportAccountability({
    requestId: "audit-export-2026",
    purposeCode: "AUDIT_REVIEW",
  });
  assert.equal(JSON.parse(accountabilityPackage).packageType, "COMPANY_OS_ACCOUNTABILITY_EXPORT");
  const accountabilityCommand = calls.find(({ url, init }) =>
    url.endsWith("/accountability-exports") && init?.method === "POST");
  assert.deepEqual(JSON.parse(String(accountabilityCommand?.init?.body)), {
    requestId: "audit-export-2026", purposeCode: "AUDIT_REVIEW",
  });
  assert.equal((await client.inspectCompanyBackup(backup)).identityBinding, "EXACT");
  const inspectionCommand = calls.find(({ url, init }) => url.endsWith("/api/v1/companies/restore/inspection") && init?.method === "POST");
  assert.equal(JSON.parse(String(inspectionCommand?.init?.body)).backup.companyId, "company-one");
  assert.equal(await client.importCompany(backup), "company-one");
  const importCommand = calls.find(({ url, init }) => url.endsWith("/api/v1/companies/restore") && init?.method === "POST");
  assert.equal(JSON.parse(String(importCommand?.init?.body)).backup.companyId, "company-one");
  await client.archiveCompany({ exportDigest: `sha256:${"b".repeat(64)}`,
    retentionPolicyId: "standard-retention", reason: "Customer requested closure" });
  const archiveCommand = calls.find(({ url, init }) => url.endsWith("/companies/company-one/archive") && init?.method === "POST");
  assert.deepEqual(JSON.parse(String(archiveCommand?.init?.body)), {
    expectedStatus: "active", exportDigest: `sha256:${"b".repeat(64)}`,
    retentionPolicyId: "standard-retention", reason: "Customer requested closure",
  });

  await client.assignWork({
    title: "New brief", goal: "Prepare new brief", agentId: "agent-one",
    departmentId: "operations", requestedBy: "human-one", actionIds: ["read-knowledge"],
  });
  const workCommand = calls.find(({ url, init }) => url.endsWith("/work") && init?.method === "POST");
  assert.ok(workCommand);
  const workBody = JSON.parse(String(workCommand.init?.body)) as { draft: Record<string, unknown> };
  assert.match(String(workBody.draft.id), /^work-/);
  const { id: _generatedId, ...workDraft } = workBody.draft;
  assert.deepEqual(workDraft, {
    title: "New brief", goal: "Prepare new brief", scope: "AGENT", departmentId: "operations",
    projectId: null, agentId: "agent-one", requestedBy: "human-one",
    actionIds: ["read-knowledge"], parentWorkId: null,
  });

  await client.assignWork({
    title: "Governed brief", goal: "Read governed source", agentId: "agent-one",
    departmentId: "operations", requestedBy: "human-one", actionIds: ["read-knowledge"],
    executionPreparation: { dataAccess: [{ requestId: "data-request-one", contractId: "contract-one",
      dataSourceId: "crm-one", operation: "READ", purpose: "customer-report",
      classification: "CONFIDENTIAL", destinationId: null, contentDigest: null }], secretLeases: [] },
  });
  const governedWorkCommand = calls.filter(({ url, init }) => url.endsWith("/work") && init?.method === "POST").at(-1);
  assert.deepEqual(JSON.parse(String(governedWorkCommand?.init?.body)).executionPreparation, {
    dataAccess: [{ requestId: "data-request-one", contractId: "contract-one", dataSourceId: "crm-one",
      operation: "READ", purpose: "customer-report", classification: "CONFIDENTIAL",
      destinationId: null, contentDigest: null }], secretLeases: [],
  });

  await client.decideApproval("APPROVED");
  const decision = calls.find(({ url }) => url.endsWith("/approvals/approval-one/decisions"));
  assert.ok(decision);
  assert.deepEqual(JSON.parse(String(decision.init?.body)), {
    decision: "APPROVED", expectedBinding: projection.pendingApprovals[0].binding,
  });
});

test("formal Web client follows bounded Work, Activity, and Run timeline cursors", async () => {
  const work = (id: string) => ({
    id, companyId: "company-one", title: id, goal: id, scope: "AGENT",
    departmentId: "operations", projectId: null, agentId: "agent-one", requestedBy: "human-one",
    actionIds: ["read"], parentWorkId: null, accountableHumanId: "human-one",
    responsibilityContractId: "contract-one", runtimeConnectorId: "connector-one", status: "PENDING",
  });
  const requested: string[] = [];
  const client = createFormalApplicationClient({
    baseUrl: "https://company-os.example", webOrigin: "https://app.company-os.example",
    companyId: "company-one",
    fetcher: async (input) => {
      const url = String(input);
      requested.push(url);
      if (url.includes("/work?cursor=0")) return response({ schemaVersion: 1,
        items: [{ work: work("work-one"), attempts: [] }], nextCursor: "1" });
      if (url.includes("/work?cursor=1")) return response({ schemaVersion: 1,
        items: [{ work: work("work-two"), attempts: [] }], nextCursor: null });
      if (url.includes("/events?afterSequence=0")) return response({ schemaVersion: 1,
        workId: "work-one", attemptId: "attempt-one", items: [{ sequence: 1, id: "event-one",
          type: "attempt.started", occurredAt: "2026-08-25T00:00:00.000Z", actorId: "agent-one",
          summary: "Started", attributes: {} }], nextSequence: 1 });
      if (url.includes("/events?afterSequence=1")) return response({ schemaVersion: 1,
        workId: "work-one", attemptId: "attempt-one", items: [{ sequence: 2, id: "event-two",
          type: "attempt.finished", occurredAt: "2026-08-25T00:01:00.000Z", actorId: "agent-one",
          summary: "Finished", attributes: {} }], nextSequence: null });
      if (url.includes("/activity?afterSequence=0")) return response({ schemaVersion: 1,
        items: [{ sequence: 1, id: "activity-one", type: "work.dispatched",
          occurredAt: "2026-08-25T00:00:00.000Z", actorId: "human-one", summary: "First", correlationId: "work-one" }],
        nextSequence: 1 });
      if (url.includes("/activity?afterSequence=1")) return response({ schemaVersion: 1,
        items: [{ sequence: 2, id: "activity-two", type: "work.completed",
          occurredAt: "2026-08-25T00:01:00.000Z", actorId: "agent-one", summary: "Second", correlationId: "work-one" }],
        nextSequence: null });
      return response({ error: { code: "UNEXPECTED_REQUEST" } }, 500);
    },
  });

  assert.deepEqual((await client.workCatalog()).items.map(({ work }) => work.id), ["work-one", "work-two"]);
  assert.deepEqual((await client.workRunTimeline("work-one", "attempt-one")).items.map(({ id }) => id), ["event-one", "event-two"]);
  assert.deepEqual((await client.activity()).items.map(({ id }) => id), ["activity-one", "activity-two"]);
  assert.equal(requested.length, 6);
});

test("formal Web snapshot derives phase from the latest Work's own Attempt", async () => {
  const work = (id: string) => ({ id, companyId: "company-one", title: id, goal: id,
    scope: "AGENT", departmentId: "operations", projectId: null, agentId: "agent-one",
    requestedBy: "human-one", actionIds: ["read-knowledge"], parentWorkId: null,
    accountableHumanId: "human-one", responsibilityContractId: "contract-one",
    runtimeConnectorId: "connector-one", status: "PENDING" });
  const client = createFormalApplicationClient({
    baseUrl: "https://company-os.example", webOrigin: "https://app.company-os.example",
    companyId: "company-one",
    fetcher: async () => response({
      schemaVersion: 1, mode: "PRODUCTION", viewer: { actorId: "human-one", displayName: "Human One" },
      organization: { company: { id: "company-one", name: "Company", purpose: "Operate", locale: "en" },
        departments: [{ id: "operations", name: "Operations", mandate: "Operate" }],
        humans: [{ id: "human-one", name: "Human One", title: "Owner", departmentId: "operations", avatarId: "human-one" }],
        agents: [{ id: "agent-one", name: "Agent One", role: "Research", departmentId: "operations",
          accountableHumanId: "human-one", runtimeConnectorId: "connector-one", avatarId: "fish-one", autonomyLevel: 2 }] },
      responsibilities: { revision: 1, contracts: [{
        id: "contract-one", companyId: "company-one", agentId: "agent-one",
        accountableHumanId: "human-one", backupHumanId: null, autonomyLevel: 2,
        allowedActions: ["read-knowledge"], approvalRequiredActions: [],
        escalationTimeoutSeconds: null, status: "ACTIVE",
      }] },
      agentLifecycle: { revision: 1, agents: [{
        companyId: "company-one", agentId: "agent-one", status: "running",
        pauseReason: null, pausedAt: null, errorCode: null, updatedAt: "2026-08-25T00:00:00.000Z",
        eligibility: { assignable: true, invokable: true, assignabilityReason: "eligible",
          invokabilityReason: "eligible", orgChainHealth: { status: "healthy", reason: "healthy",
            firstInvalidAgentId: null, pausedAncestorIds: [] } },
      }] },
      work: [work("work-old"), work("work-latest")],
      attempts: [
        { id: "attempt-latest", workId: "work-latest", status: "RUNNING", attemptNumber: 1,
          evidenceReferences: [], resultId: null, reconciliation: null, preparationStatus: "PREPARED" },
        { id: "attempt-old", workId: "work-old", status: "SUCCEEDED", attemptNumber: 1,
          evidenceReferences: [], resultId: "result-old", reconciliation: null, preparationStatus: "PREPARED" },
      ],
      pendingApprovals: [], generatedAt: "2026-08-25T00:00:00.000Z",
    }),
  });
  assert.equal((await client.snapshot()).phase, "SIMULATING_TOOL_ACTIVITY");
});

test("formal Web rejects malformed catalog records at the transport boundary", async () => {
  const client = createFormalApplicationClient({
    baseUrl: "https://company-os.example", webOrigin: "https://app.company-os.example",
    companyId: "company-one",
    fetcher: async () => response({ schemaVersion: 1, items: [{
      work: { id: "work-one", companyId: "company-other", title: { unsafe: true } },
      attempts: "not-an-array",
    }], nextCursor: null }),
  });
  await assert.rejects(client.workCatalog(), /WORK_CATALOG_PROJECTION_INVALID/);
});

test("formal Web rejects cross-tenant Agent Boss projections before rendering responsibility data", async () => {
  const client = createFormalApplicationClient({
    baseUrl: "https://company-os.example", webOrigin: "https://app.company-os.example",
    companyId: "company-one",
    fetcher: async () => response({
      schemaVersion: 1, mode: "PRODUCTION", viewer: { actorId: "human-one", displayName: "Human One" },
      organization: { company: { id: "company-other", name: "Other", purpose: "Other tenant", locale: "en" },
        departments: [{ id: "operations", name: "Operations", mandate: "Operate" }],
        humans: [{ id: "human-one", name: "Human One", title: "Owner", departmentId: "operations", avatarId: "human-one" }],
        agents: [] },
      responsibilities: { revision: 0, contracts: [] }, agentLifecycle: { revision: 0, agents: [] },
      work: [], attempts: [], pendingApprovals: [], generatedAt: "2026-08-25T00:00:00.000Z",
    }),
  });
  await assert.rejects(client.snapshot(), /FORMAL_API_PROJECTION_INVALID/);
});

test("formal Web rejects fixture evidence and inconsistent decisions in a formal accountability ledger", async () => {
  const invalidPayloads = [{
    schemaVersion: 1, companyId: "company-one", approvals: [], evidence: [{
      id: "evidence-one", workId: "work-one", attemptId: "attempt-one", kind: "ARTIFACT",
      summary: "Fixture must not enter formal UI", contentDigest: `sha256:${"e".repeat(64)}`,
      recordedAt: "2026-08-25T00:00:00.000Z", provenance: "DEMO_FIXTURE", source: "CONNECTOR",
    }], generatedAt: "2026-08-25T00:00:00.000Z",
  }, {
    schemaVersion: 1, companyId: "company-one", approvals: [{
      request: { id: "approval-one", companyId: "company-one", status: "AWAITING_APPROVAL",
        requestedAt: "2026-08-25T00:00:00.000Z", expiresAt: "2026-08-26T00:00:00.000Z",
        binding: { action: { id: "publish-content", type: "publish-content", description: "Publish",
          inputDigest: `sha256:${"a".repeat(64)}`, risk: "HIGH" }, workId: "work-one",
          responsibilityContractId: "contract-one", executingAgentId: "agent-one",
          accountableHumanId: "human-one", evidenceReferences: [], resultReference: null } },
      decision: null, status: "APPROVED",
    }], evidence: [], generatedAt: "2026-08-25T00:00:00.000Z",
  }];
  for (const payload of invalidPayloads) {
    const client = createFormalApplicationClient({
      baseUrl: "https://company-os.example", webOrigin: "https://app.company-os.example",
      companyId: "company-one", fetcher: async () => response(payload),
    });
    await assert.rejects(client.accountabilityLedger(), /ACCOUNTABILITY_LEDGER_INVALID/);
  }
});

test("formal Web refuses an accountability package with a bad digest or private material", async () => {
  const basePackage = {
    schemaVersion: 1,
    packageType: "COMPANY_OS_ACCOUNTABILITY_EXPORT",
    exportId: "export-one",
    companyId: "company-one",
    sourceEventSequence: 1,
    exportedAt: "2026-08-26T00:00:00.000Z",
    policy: { retentionPolicyId: "standard-retention",
      exportPolicyId: "standard-accountability-export", purposeCode: "AUDIT_REVIEW" },
    approvals: [], evidence: [], responsibilities: [],
    digest: `sha256:${"0".repeat(64)}`,
  };
  const client = createFormalApplicationClient({
    baseUrl: "https://company-os.example/",
    webOrigin: "https://app.company-os.example",
    companyId: "company-one",
    fetcher: () => response({ schemaVersion: 1, package: basePackage }),
  });
  await assert.rejects(
    client.exportAccountability({ requestId: "audit-one", purposeCode: "AUDIT_REVIEW" }),
    /ACCOUNTABILITY_EXPORT_DIGEST_MISMATCH/,
  );

  const privateClient = createFormalApplicationClient({
    baseUrl: "https://company-os.example/",
    webOrigin: "https://app.company-os.example",
    companyId: "company-one",
    fetcher: () => response({ schemaVersion: 1, package: { ...basePackage,
      rawEnterpriseRecord: { customer: "must-not-leave" } } }),
  });
  await assert.rejects(
    privateClient.exportAccountability({ requestId: "audit-two", purposeCode: "AUDIT_REVIEW" }),
    /ADMINISTRATION_PROJECTION_INVALID/,
  );
});

test("formal Web rejects an access projection that enables company capabilities without a verified session", async () => {
  const client = createFormalApplicationClient({
    baseUrl: "https://company-os.example", webOrigin: "https://app.company-os.example",
    fetcher: async () => response({
      schemaVersion: 1, mode: "FORMAL", deploymentProfile: "self-hosted", entryState: "READY",
      identityProvider: { protocol: "OIDC", configured: true }, session: { authenticated: false },
      capabilities: { diagnostics: true, identitySettings: true, companyData: true, companyMutation: true,
        execution: true, approval: true, governance: true }, blockers: [],
    }),
  });
  await assert.rejects(client.formalAccess(), /FORMAL_ACCESS_PROJECTION_INVALID/);
});

test("formal Web rejects private credential references or cross-tenant records in administration", async () => {
  const base = {
    schemaVersion: 1, mode: "PRODUCTION", viewer: { actorId: "human-one", displayName: "Human One" },
    retentionPolicyId: "standard-retention",
    connectorCatalog: { revision: 0, connectors: [] }, runtimeConnectors: [], secretBrokerRuntime: null,
    runtimeModelProviders: [], runtimeDataConnectors: [], runtimeFederatedSources: [],
    governance: { revision: 0, modelRoutingPolicies: [], dataAuthorizationContracts: [] },
    toolAccess: { companyId: "company-one", revision: 0, profiles: [], entries: [], bindings: [], policies: [] },
    usageBudget: { ledger: { companyId: "company-one", revision: 0, costEvents: [], policies: [] },
      policySummaries: [], totalReportedCostCents: 0, unpricedEventCount: 0 },
    egressDecisions: [], generatedAt: "2026-08-25T00:00:00.000Z",
  };
  for (const payload of [
    { ...base, governance: { ...base.governance, credentialReference: "must-not-reach-browser" } },
    { ...base, toolAccess: { ...base.toolAccess, companyId: "company-other" } },
  ]) {
    const client = createFormalApplicationClient({
      baseUrl: "https://company-os.example", webOrigin: "https://app.company-os.example",
      companyId: "company-one", fetcher: async () => response(payload),
    });
    await assert.rejects(client.administration(), /ADMINISTRATION_PROJECTION_INVALID/);
  }
});

test("formal Web rejects private or cross-tenant operational risk records", async () => {
  const base = { schemaVersion: 1, companyId: "company-one", traces: [], accessEdges: [],
    violations: [], alerts: [], cases: [], generatedAt: "2026-09-05T00:00:00.000Z" };
  for (const payload of [
    { ...base, traces: [{ id: "trace-one", companyId: "company-other", rawPrompt: "forbidden" }] },
    { ...base, cases: [{ id: "case-one", companyId: "company-one", status: "OPEN",
      workId: "work-one", agentId: "agent-one", accountableHumanId: "human-one",
      ownerHumanId: "human-one", revision: 0, summary: "Risk", alertIds: [], rawOutput: "forbidden" }] },
  ]) {
    const client = createFormalApplicationClient({ baseUrl: "https://company-os.example",
      webOrigin: "https://app.company-os.example", companyId: "company-one",
      fetcher: async () => response(payload) });
    await assert.rejects(client.operationalRisk(), /OPERATIONAL_RISK_PROJECTION_INVALID|ADMINISTRATION_PROJECTION_INVALID/);
  }
});

test("formal Web admits only tenant-bound AI asset, evaluation, and verified-value projections", async () => {
  const client = createFormalApplicationClient({ baseUrl: "https://company-os.example",
    webOrigin: "https://app.company-os.example", companyId: "company-one", fetcher: async (input) => {
      const url = String(input);
      if (url.includes("/ai-value?")) return response({ ledgerRevision: 0, scopeType: "COMPANY", scopeId: "company-one",
        periodStart: "2026-09-01T00:00:00.000Z", periodEnd: "2026-10-01T00:00:00.000Z",
        verifiedHoursSavedMinutes: 0, verifiedAdoptionBps: null, verifiedOutcomeValueCents: 0,
        verifiedCostCents: 0, verifiedNetValueCents: null,
        unavailableReasons: ["NO_VERIFIED_OUTCOME_VALUE"], evidenceReferences: [] });
      if (url.endsWith("/ai-evaluations")) return response({ catalog: { companyId: "company-one",
        revision: 0, templates: [], datasets: [], results: [] }, trends: [] });
      return response({ companyId: "company-one", revision: 0, assets: [], relationships: [],
        shadowReviews: [], duplicateReviews: [] });
    } });
  assert.equal((await client.aiAssets())?.companyId, "company-one");
  assert.equal((await client.aiEvaluations())?.catalog.revision, 0);
  assert.equal((await client.aiValue({ scopeType: "COMPANY", scopeId: "company-one",
    periodStart: "2026-09-01T00:00:00.000Z", periodEnd: "2026-10-01T00:00:00.000Z" }))?.verifiedNetValueCents, null);
  const invalid = createFormalApplicationClient({ baseUrl: "https://company-os.example",
    webOrigin: "https://app.company-os.example", companyId: "company-one",
    fetcher: async () => response({ companyId: "company-other", revision: 0, assets: [], relationships: [],
      shadowReviews: [], duplicateReviews: [] }) });
  await assert.rejects(invalid.aiAssets(), /AI_ASSET_PROJECTION_INVALID/);
});

test("formal Web accepts an earlier administration projection without federated sources during rolling upgrade", async () => {
  const payload = {
    schemaVersion: 1, mode: "PRODUCTION", viewer: { actorId: "human-one", displayName: "Human One" },
    retentionPolicyId: "standard-retention",
    connectorCatalog: { revision: 0, connectors: [] }, runtimeConnectors: [], secretBrokerRuntime: null,
    runtimeModelProviders: [], runtimeDataConnectors: [],
    governance: { revision: 0, modelRoutingPolicies: [], dataAuthorizationContracts: [] },
    toolAccess: { companyId: "company-one", revision: 0, profiles: [], entries: [], bindings: [], policies: [] },
    usageBudget: { ledger: { companyId: "company-one", revision: 0, costEvents: [], policies: [] },
      policySummaries: [], totalReportedCostCents: 0, unpricedEventCount: 0 },
    egressDecisions: [], generatedAt: "2026-08-25T00:00:00.000Z",
  };
  const client = createFormalApplicationClient({
    baseUrl: "https://company-os.example", webOrigin: "https://app.company-os.example",
    companyId: "company-one", fetcher: async () => response(payload),
  });
  assert.deepEqual((await client.administration()).runtimeFederatedSources, []);

  const invalidClient = createFormalApplicationClient({
    baseUrl: "https://company-os.example", webOrigin: "https://app.company-os.example",
    companyId: "company-one", fetcher: async () => response({ ...payload, runtimeFederatedSources: {} }),
  });
  await assert.rejects(invalidClient.administration(), /ADMINISTRATION_PROJECTION_INVALID/);
});

test("formal Web client surfaces stable API error codes without depending on message copy", async () => {
  const client = createFormalApplicationClient({
    baseUrl: "",
    webOrigin: "http://127.0.0.1:4173",
    companyId: "company-one",
    fetcher: async () => response({ error: { code: "TENANT_MISMATCH", parameters: {} } }, 403),
  });
  await assert.rejects(client.snapshot(), /TENANT_MISMATCH/);
});

test("formal Web admits only bounded JSON API responses", async () => {
  const invalidResponses: readonly [() => Response, RegExp][] = [
    [() => new Response("<html>not an API response</html>", {
      status: 200, headers: { "content-type": "text/html" },
    }), /FORMAL_API_RESPONSE_CONTENT_TYPE_INVALID/],
    [() => new Response("{}", {
      headers: { "content-type": "application/json", "content-length": "4194305" },
    }), /FORMAL_API_RESPONSE_TOO_LARGE/],
    [() => new Response("{}", {
      headers: { "content-type": "application/json", "content-length": "unknown" },
    }), /FORMAL_API_RESPONSE_CONTENT_LENGTH_INVALID/],
    [() => new Response(null, {
      headers: { "content-type": "application/json" },
    }), /FORMAL_API_RESPONSE_EMPTY/],
    [() => new Response("{not-json", {
      headers: { "content-type": "application/json" },
    }), /FORMAL_API_RESPONSE_JSON_INVALID/],
    [() => new Response(JSON.stringify({ padding: "x".repeat(4 * 1024 * 1024) }), {
      headers: { "content-type": "application/problem+json" },
    }), /FORMAL_API_RESPONSE_TOO_LARGE/],
  ];

  for (const [invalidResponse, expectedError] of invalidResponses) {
    const client = createFormalApplicationClient({
      baseUrl: "https://company-os.example", webOrigin: "https://app.company-os.example",
      fetcher: async () => invalidResponse(),
    });
    await assert.rejects(client.formalAccess(), expectedError);
  }
});

test("formal Web applies the same JSON response boundary to OIDC start", async () => {
  const client = createFormalApplicationClient({
    baseUrl: "https://company-os.example", webOrigin: "https://app.company-os.example",
    fetcher: async () => new Response("upstream proxy failure", {
      status: 500, headers: { "content-type": "text/plain" },
    }),
  });
  await assert.rejects(
    client.beginFormalSignIn(),
    /FORMAL_API_RESPONSE_CONTENT_TYPE_INVALID/,
  );
});

test("formal Web starts the Feishu provider announced by the access boundary", async () => {
  const calls: { readonly url: string; readonly init?: RequestInit }[] = [];
  const client = createFormalApplicationClient({
    baseUrl: "https://company-os.example",
    webOrigin: "https://app.company-os.example",
    fetcher: async (input, init) => {
      calls.push({ url: String(input), init });
      if (String(input).endsWith("/api/v1/access")) return response({
        schemaVersion: 1,
        mode: "FORMAL",
        deploymentProfile: "self-hosted",
        entryState: "AUTHENTICATION_REQUIRED",
        identityProvider: { protocol: "OAUTH2", providerId: "feishu", configured: true },
        session: { authenticated: false },
        capabilities: {
          diagnostics: true, identitySettings: true, companyData: false,
          companyMutation: false, execution: false, approval: false, governance: false,
        },
        blockers: [{ code: "FORMAL_IDENTITY_REQUIRED", parameters: {} }],
      });
      return response({ url: "https://accounts.feishu.cn/open-apis/authen/v1/authorize", redirect: true });
    },
  });

  await client.formalAccess();
  assert.equal(await client.beginFormalSignIn(), "https://accounts.feishu.cn/open-apis/authen/v1/authorize");
  const signIn = calls.find(({ url }) => url.endsWith("/api/auth/sign-in/social"));
  assert.ok(signIn);
  assert.equal(JSON.parse(String(signIn.init?.body)).provider, "feishu");
});

test("formal Web bounds the complete request and maps network failures to stable errors", async () => {
  const timeoutClient = createFormalApplicationClient({
    baseUrl: "https://company-os.example", webOrigin: "https://app.company-os.example",
    requestTimeoutMs: 5,
    fetcher: async () => new Promise<Response>(() => undefined),
  });
  await assert.rejects(timeoutClient.formalAccess(), /FORMAL_API_REQUEST_TIMEOUT/);

  const offlineClient = createFormalApplicationClient({
    baseUrl: "https://company-os.example", webOrigin: "https://app.company-os.example",
    fetcher: async () => { throw new TypeError("browser-private network detail"); },
  });
  await assert.rejects(offlineClient.formalAccess(), (error: unknown) =>
    error instanceof Error && error.message === "FORMAL_API_UNREACHABLE");

  for (const status of [502, 503, 504]) {
    const gatewayClient = createFormalApplicationClient({
      baseUrl: "https://company-os.example", webOrigin: "https://app.company-os.example",
      fetcher: async () => new Response(null, { status }),
    });
    await assert.rejects(gatewayClient.formalAccess(), (error: unknown) =>
      error instanceof Error && error.message === "FORMAL_API_UNREACHABLE");
  }
});

test("formal Web never retries a timed-out mutation implicitly", async () => {
  let calls = 0;
  const client = createFormalApplicationClient({
    baseUrl: "https://company-os.example", webOrigin: "https://app.company-os.example",
    requestTimeoutMs: 5,
    fetcher: async () => {
      calls += 1;
      return new Promise<Response>(() => undefined);
    },
  });
  await assert.rejects(client.signOut(), /FORMAL_API_REQUEST_TIMEOUT/);
  assert.equal(calls, 1);
});

test("formal Web rejects unsafe request timeout configuration at construction", () => {
  for (const requestTimeoutMs of [0, 120_001, 1.5, Number.NaN]) {
    assert.throws(() => createFormalApplicationClient({
      baseUrl: "https://company-os.example", webOrigin: "https://app.company-os.example",
      requestTimeoutMs,
    }), /FORMAL_API_REQUEST_TIMEOUT_INVALID/);
  }
});
