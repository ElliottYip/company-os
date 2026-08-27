import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";

async function enterDemo(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the isolated demo instead" }).click();
  await expect(page.getByRole("heading", { name: "Agent Portfolio" })).toBeVisible();
  await expect(page.getByText("DEMO FIXTURE · NO EXTERNAL CALLS")).toBeVisible();
}

test("first run creates a local company draft while formal capabilities remain gated", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Build an ANC where humans stay accountable." })).toBeVisible();
  await expect(page.getByRole("button", { name: /Create a company/ })).toBeVisible();
  await expect(page.getByText("DEMO FIXTURE · NO EXTERNAL CALLS")).toBeHidden();

  await page.getByRole("button", { name: /Create a company/ }).click();
  await expect(page.getByRole("dialog", { name: "What is your company called?" })).toBeVisible();
  await page.getByLabel("Company name").fill("Northstar Studio");
  await page.getByLabel("Company mission").fill("Build reliable operations with accountable humans and Agents.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Department name").fill("Operations");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Human name").fill("Alex Chen");
  await page.getByLabel("Role and responsibility").fill("Operations Lead");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Agent name").fill("Research Assistant");
  await page.getByLabel("Agent role").fill("Prepare evidence-backed operating briefs");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Northstar Studio", { exact: true }).last()).toBeVisible();
  await page.getByRole("button", { name: "Create company" }).click();

  await expect(page.getByText("Local draft — formal capabilities are not connected")).toBeVisible();
  await expect(page.getByText("Northstar Studio", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Company OS sections" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Configure formal access/ })).toBeVisible();
  await page.getByRole("button", { name: /Configure formal access/ }).click();
  await expect(page.getByRole("heading", { name: "Connect enterprise identity" })).toBeVisible();
  await expect(page.locator(".formal-gate-code code")).toHaveText("FORMAL_OIDC_NOT_CONFIGURED");
  await expect(page.getByRole("navigation", { name: "Restricted formal navigation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Identity settings" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Diagnostics" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Organization" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Tasks" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Approvals" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Governance" })).toBeDisabled();
  await expect(page.getByText("Coral Labs", { exact: true })).toBeHidden();

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByText("Local draft — formal capabilities are not connected")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: /Open an existing company/ }).click();
  await expect(page.getByRole("heading", { name: "Connect enterprise identity" })).toBeVisible();
});

test("configured formal entry redirects directly to enterprise SSO and preserves the return path", async ({ page }) => {
  let callbackURL: string | null = null;
  await page.route("**/api/v1/access", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      schemaVersion: 1, mode: "FORMAL", deploymentProfile: "self-hosted",
      entryState: "AUTHENTICATION_REQUIRED",
      identityProvider: { protocol: "OIDC", configured: true },
      session: { authenticated: false },
      capabilities: { diagnostics: true, identitySettings: true, companyData: false,
        companyMutation: false, execution: false, approval: false, governance: false },
      blockers: [{ code: "FORMAL_IDENTITY_REQUIRED", parameters: {} }],
    }),
  }));
  await page.route("**/api/auth/sign-in/social", async (route) => {
    callbackURL = (route.request().postDataJSON() as { callbackURL?: string }).callbackURL ?? null;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ url: "https://identity.example.test/authorize" }),
    });
  });
  await page.route("https://identity.example.test/authorize", async (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><title>Enterprise identity</title>",
  }));

  await page.goto("/?mode=formal");
  const webOrigin = new URL(page.url()).origin;
  await expect.poll(() => callbackURL).toBe(`${webOrigin}/?mode=formal`);
  await expect(page).toHaveURL("https://identity.example.test/authorize");
});

test("formal entry preserves a recoverable offline state and retries authoritatively", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/v1/access", async (route) => {
    requests += 1;
    if (requests === 1) {
      await route.abort("failed");
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1, mode: "FORMAL", deploymentProfile: "self-hosted",
        entryState: "BLOCKED",
        identityProvider: { protocol: "OIDC", configured: false },
        session: { authenticated: false },
        capabilities: { diagnostics: true, identitySettings: true, companyData: false,
          companyMutation: false, execution: false, approval: false, governance: false },
        blockers: [{ code: "FORMAL_OIDC_NOT_CONFIGURED", parameters: {} }],
      }),
    });
  });

  await page.goto("/?mode=formal");
  await expect(page.getByRole("heading", { name: "Company OS is unreachable. Your current page and input have been preserved." })).toBeVisible();
  await expect(page.getByText("FORMAL_API_UNREACHABLE", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Connect enterprise identity" })).toBeVisible();
  expect(requests).toBe(2);
});

test("managed-cloud waits for server-side provisioning instead of exposing first-admin claim", async ({ page }) => {
  await page.route("**/api/v1/access", async (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({
      schemaVersion: 1, mode: "FORMAL", deploymentProfile: "managed-cloud",
      entryState: "READY", identityProvider: { protocol: "OIDC", configured: true },
      session: { authenticated: true },
      capabilities: { diagnostics: true, identitySettings: true, companyData: true,
        companyMutation: true, execution: true, approval: true, governance: true },
      blockers: [],
    }),
  }));
  await page.route("**/api/v1/companies", async (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ schemaVersion: 1, companies: [], isInstanceAdmin: false }),
  }));
  await page.goto("/?mode=formal");
  await expect(page.getByRole("heading", { name: "Managed account provisioning" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Claim first administrator" })).toBeHidden();
  await expect(page.getByText("No company membership yet")).toBeVisible();
});

test("verified formal identity reaches explicit admin claim and atomic company creation", async ({ page }) => {
  let claimed = false;
  let created = false;
  let organizationCreated = false;
  let signedOut = false;
  let restoreInspectionCount = 0;
  let restoreCommandCount = 0;
  await page.route("**/api/v1/access", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      schemaVersion: 1, mode: "FORMAL", deploymentProfile: "self-hosted",
      entryState: signedOut ? "AUTHENTICATION_REQUIRED" : "READY",
      identityProvider: { protocol: "OIDC", configured: true }, session: { authenticated: !signedOut },
      capabilities: signedOut
        ? { diagnostics: true, identitySettings: true, companyData: false, companyMutation: false,
            execution: false, approval: false, governance: false }
        : { diagnostics: true, identitySettings: true, companyData: true, companyMutation: true,
            execution: true, approval: true, governance: true },
      blockers: signedOut ? [{ code: "FORMAL_IDENTITY_REQUIRED", parameters: {} }] : [],
    }),
  }));
  await page.route("**/api/auth/sign-out", async (route) => {
    signedOut = true;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
  });
  await page.route("**/api/v1/bootstrap/claim", async (route) => {
    claimed = true;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ claimed: true, userId: "human-one" }) });
  });
  await page.route("**/api/v1/companies", async (route) => {
    if (route.request().method() === "POST") {
      created = true;
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ companyId: "company-one", membershipRole: "owner" }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        companies: created ? [{ id: "company-one", name: organization.company.name, membershipRole: "owner" }] : [],
        isInstanceAdmin: claimed,
      }),
    });
  });
  await page.route("**/api/v1/companies/restore/inspection", async (route) => {
    restoreInspectionCount += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      companyId: "company-one", name: "Coral Labs Global", purpose: "Keep humans accountable.", locale: "en-US",
      actorUserId: "human-one", identityBinding: "EXACT", eventCount: 12,
      deliveredPublicationCount: 2, checkpointCount: 3, humanCount: 2, agentCount: 1,
    }) });
  });
  await page.route("**/api/v1/companies/restore", async (route) => {
    restoreCommandCount += 1;
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({
      companyId: "company-one", name: "Coral Labs Global", status: "active", membershipRole: "owner",
    }) });
  });
  let organization = {
    company: { id: "company-one", name: "Coral Labs", purpose: "Keep humans accountable.", locale: "en-US" },
    departments: [{ id: "department-one", name: "Operations", mandate: "Keep humans accountable." }],
    humans: [{ id: "human-one", name: "Human One", title: "Founder", departmentId: "department-one", avatarId: "human-default" }],
    agents: [],
  };
  let responsibilityContracts: unknown[] = [];
  let responsibilityRevision = 0;
  let agentLifecycleStatus = "pending_approval";
  let agentLifecycleRevision = 0;
  let jordanRole = "operator";
  let planning = {
    companyId: "company-one", revision: 0,
    goals: [] as Record<string, unknown>[], projects: [] as Record<string, unknown>[],
  };
  await page.route("**/api/v1/companies/company-one/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/human-members/human-jordan") && route.request().method() === "PATCH") {
      jordanRole = (route.request().postDataJSON() as { role: string }).role;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        userId: "human-jordan", displayName: "Jordan", email: "jordan@example.com",
        role: jordanRole, status: "active",
        createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T01:00:00.000Z",
      }) });
      return;
    }
    if (url.endsWith("/human-members")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        schemaVersion: 1,
        members: [{
          userId: "human-one", displayName: "Human One", email: "human@example.com",
          role: "owner", status: "active",
          createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z",
        }, {
          userId: "human-jordan", displayName: "Jordan", email: "jordan@example.com",
          role: jordanRole, status: "active",
          createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z",
        }],
      }) });
      return;
    }
    if (url.endsWith("/organization") && route.request().method() === "POST") {
      organizationCreated = true;
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({
        organization, projects: [], workspaces: [], positions: [], reportingLines: [],
      }) });
      return;
    }
    if (!organizationCreated) {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({
        error: { code: "ORGANIZATION_NOT_FOUND", parameters: {} },
      }) });
      return;
    }
    if (url.endsWith("/organization/revisions") && route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { organization: typeof organization };
      organization = body.organization;
      responsibilityContracts = organization.agents.map((agent) =>
        (responsibilityContracts as { agentId?: string }[]).find(({ agentId }) => agentId === agent.id) ?? ({
          id: `contract-${agent.id}`, companyId: "company-one", agentId: agent.id,
          accountableHumanId: agent.accountableHumanId, backupHumanId: null,
          autonomyLevel: agent.autonomyLevel, allowedActions: ["read-knowledge", "draft-content"],
          approvalRequiredActions: [], escalationTimeoutSeconds: null, status: "DRAFT",
        }));
      responsibilityRevision += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(organization) });
      return;
    }
    if (url.endsWith("/profile") && route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as { next: typeof organization.company };
      organization = { ...organization, company: { ...organization.company, ...body.next } };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(organization) });
      return;
    }
    if (url.endsWith("/departments/department-one/archive") && route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { destinationDepartmentId: string };
      organization = { ...organization,
        departments: organization.departments.filter(({ id }) => id !== "department-one"),
        humans: organization.humans.map((human) => human.departmentId === "department-one"
          ? { ...human, departmentId: body.destinationDepartmentId } : human),
        agents: organization.agents.map((agent) => agent.departmentId === "department-one"
          ? { ...agent, departmentId: body.destinationDepartmentId } : agent),
      };
      planning = { ...planning, revision: planning.revision + 1,
        projects: planning.projects.map((project) => ({ ...project,
          departmentIds: Array.isArray(project.departmentIds)
            ? [...new Set((project.departmentIds as string[]).map((id) =>
              id === "department-one" ? body.destinationDepartmentId : id))]
            : project.departmentIds,
        })) };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(organization) });
      return;
    }
    if (url.endsWith("/responsibility-contracts") && route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as { expectedRevision: number; contracts: unknown[] };
      expect(body.expectedRevision).toBe(responsibilityRevision);
      responsibilityContracts = body.contracts;
      responsibilityRevision += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        revision: responsibilityRevision, contracts: responsibilityContracts,
      }) });
      return;
    }
    if (url.includes("/agents/") && url.endsWith("/approve") && route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { expectedRevision: number };
      expect(body.expectedRevision).toBe(agentLifecycleRevision);
      agentLifecycleStatus = "idle";
      agentLifecycleRevision += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        companyId: "company-one", agentId: "agent-research-assistant", status: agentLifecycleStatus,
        pauseReason: null, pausedAt: null, errorCode: null,
        updatedAt: "2026-08-24T10:01:00.000Z",
      }) });
      return;
    }
    if (url.endsWith("/human-invites") && route.request().method() === "POST") {
      const token = "company_os_invite_0123456789abcdefghijklmnopqrstuvwxyz";
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({
        inviteId: "invite-one", token, invitePath: `/invite/${token}`,
        expiresAt: "2026-08-31T00:00:00.000Z",
      }) });
      return;
    }
    if (url.endsWith("/administration")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        schemaVersion: 1, mode: "PRODUCTION", viewer: { actorId: "human-one", displayName: "Human One" },
        retentionPolicyId: "standard-retention",
        connectorCatalog: { revision: 1, connectors: [{
          id: "connector-one", companyId: "company-one", displayName: "Codex Connector",
          protocolVersion: "1.0", operations: ["SUBMIT", "PROGRESS", "PAUSE", "RESUME", "CANCEL", "EVIDENCE", "RESULT"],
          maximumTimeoutSeconds: 3600, executionResidency: "CUSTOMER_ENVIRONMENT",
          status: "ENABLED", secretConfigured: false, runtimeHealth: "HEALTHY",
        }] },
        runtimeConnectors: [], secretBrokerRuntime: null, runtimeModelProviders: [], runtimeDataConnectors: [],
        governance: { revision: 0, modelRoutingPolicies: [], dataAuthorizationContracts: [] },
        toolAccess: { companyId: "company-one", revision: 0, profiles: [], entries: [], bindings: [], policies: [] },
        usageBudget: { ledger: { companyId: "company-one", revision: 0, costEvents: [], policies: [] },
          policySummaries: [], totalReportedCostCents: 0, unpricedEventCount: 0 },
        egressDecisions: [], generatedAt: "2026-08-24T10:00:00.000Z",
      }) });
      return;
    }
    if (url.endsWith("/accountability-ledger")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        schemaVersion: 1, companyId: "company-one", approvals: [], evidence: [],
        generatedAt: "2026-08-25T00:00:00.000Z",
      }) });
      return;
    }
    if (url.endsWith("/accountability-exports") && route.request().method() === "POST") {
      const command = route.request().postDataJSON() as { requestId: string; purposeCode: string };
      expect(command.requestId).toMatch(/^audit-[a-f0-9-]{36}$/);
      expect(command.purposeCode).toBe("AUDIT_REVIEW");
      const accountabilityPackage = {
        schemaVersion: 1, packageType: "COMPANY_OS_ACCOUNTABILITY_EXPORT",
        exportId: "export-one", companyId: "company-one", sourceEventSequence: 7,
        exportedAt: "2026-08-25T00:00:00.000Z",
        policy: { retentionPolicyId: "standard-retention",
          exportPolicyId: "standard-accountability-export", purposeCode: "AUDIT_REVIEW" },
        approvals: [], evidence: [], responsibilities: [],
      };
      const digest = `sha256:${createHash("sha256").update(JSON.stringify(accountabilityPackage)).digest("hex")}`;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        schemaVersion: 1, package: { ...accountabilityPackage, digest },
      }) });
      return;
    }
    if (url.endsWith("/goals") && route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      planning = { ...planning, revision: planning.revision + 1, goals: [...planning.goals, {
        ...body, id: "goal-one", companyId: "company-one", status: "planned",
        createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z",
      }] };
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(planning) });
      return;
    }
    if (url.endsWith("/goals/goal-one") && route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      planning = { ...planning, revision: planning.revision + 1,
        goals: planning.goals.map((goal) => ({ ...goal, ...body, updatedAt: "2026-08-25T00:01:00.000Z" })) };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(planning) });
      return;
    }
    if (url.endsWith("/projects") && route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      planning = { ...planning, revision: planning.revision + 1, projects: [...planning.projects, {
        ...body, id: "project-one", companyId: "company-one", status: "backlog", archivedAt: null,
        createdAt: "2026-08-25T00:02:00.000Z", updatedAt: "2026-08-25T00:02:00.000Z",
      }] };
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(planning) });
      return;
    }
    if (url.endsWith("/projects/project-one") && route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      planning = { ...planning, revision: planning.revision + 1,
        projects: planning.projects.map((project) => ({ ...project, ...body, updatedAt: "2026-08-25T00:03:00.000Z" })) };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(planning) });
      return;
    }
    if (url.endsWith("/projects/project-one/archive") && route.request().method() === "POST") {
      planning = { ...planning, revision: planning.revision + 1,
        projects: planning.projects.map((project) => ({ ...project,
          archivedAt: "2026-08-25T00:04:00.000Z", updatedAt: "2026-08-25T00:04:00.000Z" })) };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(planning) });
      return;
    }
    if (url.endsWith("/planning-catalog")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(planning) });
      return;
    }
    if (url.includes("/work?")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        schemaVersion: 1, items: [], nextCursor: null,
      }) });
      return;
    }
    if (url.includes("/activity?")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        schemaVersion: 1, items: [], nextSequence: null,
      }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      schemaVersion: 1, mode: "PRODUCTION", viewer: { actorId: "human-one", displayName: "Human One" },
      retentionPolicyId: "standard-retention",
      organization,
      responsibilities: { revision: responsibilityRevision, contracts: responsibilityContracts },
      agentLifecycle: {
        revision: agentLifecycleRevision,
        agents: organization.agents.map((agent) => ({
          companyId: "company-one", agentId: agent.id, status: agentLifecycleStatus,
          pauseReason: null, pausedAt: null, errorCode: null,
          updatedAt: "2026-08-24T10:00:00.000Z",
          eligibility: {
            assignable: agentLifecycleStatus === "idle", invokable: agentLifecycleStatus === "idle",
            assignabilityReason: agentLifecycleStatus === "idle" ? "eligible" : "pending_approval",
            invokabilityReason: agentLifecycleStatus === "idle" ? "eligible" : "pending_approval",
            orgChainHealth: {
              status: "healthy", reason: "healthy", firstInvalidAgentId: null, pausedAncestorIds: [],
            },
          },
        })),
      },
      work: [], attempts: [], pendingApprovals: [],
      generatedAt: "2026-08-24T10:00:00.000Z",
    }) });
  });

  await page.goto("/?mode=formal");
  await expect(page.getByRole("heading", { name: "Claim this private instance" })).toBeVisible();
  await page.getByRole("button", { name: "Claim first administrator" }).click();
  await expect(page.getByRole("heading", { name: "Create your first company" })).toBeVisible();
  await page.getByLabel("Company name").fill("Coral Labs");
  await page.getByLabel("Company purpose").fill("Keep humans accountable.");
  await page.getByLabel("Create your first company").getByRole("button", { name: "Create company" }).click();
  await expect(page.getByRole("heading", { name: "Set up the accountable owner" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("company-os.selected-company"))).toBe("company-one");
  await page.getByLabel("Department name").fill("Operations");
  await page.getByLabel("Your company title").fill("Founder");
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByText("Coral Labs", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Production", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Organization", exact: true }).first().click();
  await page.getByRole("button", { name: "Add department", exact: true }).click();
  const departmentDialog = page.getByRole("dialog", { name: "Department" });
  await departmentDialog.getByLabel("Department name").fill("Finance");
  await departmentDialog.getByLabel("Mandate").fill("Own financial controls");
  await departmentDialog.getByRole("button", { name: "Save department" }).click();
  await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible();
  await page.locator('[data-edit-department="department-finance"]').click();
  await page.getByRole("dialog", { name: "Department" }).getByLabel("Department name").fill("Finance & Risk");
  await page.getByRole("dialog", { name: "Department" }).getByRole("button", { name: "Save department" }).click();
  await expect(page.getByRole("heading", { name: "Finance & Risk", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add human" }).click();
  const humanDialog = page.getByRole("dialog", { name: "Add an accountable human" });
  await humanDialog.getByLabel("Enterprise email").fill("jordan@example.com");
  await humanDialog.getByLabel("Role and responsibility").fill("Operations Lead");
  await humanDialog.getByRole("button", { name: "Add human" }).click();
  await expect(page.getByText("Invite link created")).toBeVisible();
  await page.getByRole("button", { name: "Add Agent" }).click();
  const agentDialog = page.getByRole("dialog", { name: "Add an Agent colleague" });
  await agentDialog.getByLabel("Agent name").fill("Research Assistant");
  await agentDialog.getByLabel("Role", { exact: true }).fill("Market Research");
  await agentDialog.getByLabel("Runtime Connector").selectOption("connector-one");
  await agentDialog.getByRole("button", { name: "Add Agent" }).click();
  await expect(page.getByText("Research Assistant", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Agents", exact: true }).first().click();
  await expect(page.getByText("PENDING_APPROVAL", { exact: true })).toBeVisible();
  await expect(page.getByText(/Responsibility: DRAFT/)).toBeVisible();
  await page.getByText("Action policy", { exact: true }).click();
  await page.getByLabel("publish-content policy").selectOption("approval");
  await page.getByRole("button", { name: "Save action policy", exact: true }).click();
  await expect.poll(() => (responsibilityContracts[0] as {
    approvalRequiredActions?: string[];
  } | undefined)?.approvalRequiredActions).toEqual(["publish-content"]);
  await page.getByRole("button", { name: "Activate responsibility", exact: true }).click();
  await expect(page.getByText(/Responsibility: ACTIVE/)).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("IDLE", { exact: true })).toBeVisible();
  await expect(page.getByText(/Invocation: eligible/)).toBeVisible();
  await page.getByRole("button", { name: "Organization", exact: true }).first().click();
  await page.locator('[data-colleague-detail="human-human-one"]').first().click();
  const humanProfile = page.getByRole("dialog", { name: "Human One details" });
  await humanProfile.getByLabel("Name").fill("Alex Chen");
  await humanProfile.getByLabel("Role and responsibility").fill("Operations Director");
  await humanProfile.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Alex Chen", { exact: true }).first()).toBeVisible();
  await page.locator('[data-colleague-detail^="agent-agent-research-assistant"]').first().click();
  const agentProfile = page.getByRole("dialog", { name: "Research Assistant details" });
  await agentProfile.getByLabel("Agent name").fill("Research Analyst");
  await agentProfile.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Research Analyst", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Goals", exact: true }).first().click();
  await page.getByLabel("Goal title").fill("Launch accountable operations");
  await page.getByRole("button", { name: "Create goal" }).click();
  await expect(page.getByText("Launch accountable operations", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Activate", exact: true }).click();
  await expect(page.getByText("ACTIVE", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Mark achieved", exact: true }).click();
  await expect(page.getByText("ACHIEVED", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Projects", exact: true }).first().click();
  await page.getByLabel("Project name").fill("Operations launch");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByText("Operations launch", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.getByText("ARCHIVED", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tasks", exact: true }).first().click();
  await page.getByRole("button", { name: "New Task", exact: true }).click();
  await expect(page.getByLabel("Task title")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Organization", exact: true }).first().click();
  await page.locator('[data-edit-department="department-one"]').click();
  const archiveDialog = page.getByRole("dialog", { name: "Department" });
  await archiveDialog.getByLabel("Move records to").selectOption("department-finance");
  await archiveDialog.getByLabel("Archive reason").fill("Consolidate operating teams");
  await archiveDialog.getByRole("button", { name: "Archive and reassign" }).click();
  await expect(page.getByRole("heading", { name: "Operations", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Finance & Risk", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  const companyProfileForm = page.locator("[data-company-profile-form]");
  await companyProfileForm.locator('[name="name"]').fill("Coral Labs Global");
  await companyProfileForm.locator('[name="purpose"]').fill("Keep humans accountable across teams.");
  await page.getByRole("button", { name: "Save company settings", exact: true }).click();
  await expect(page.locator(".sidebar-brand strong")).toHaveText("Coral Labs Global");
  await page.getByRole("tab", { name: "Identity & access", exact: true }).click();
  await expect(page.getByText("human@example.com", { exact: true })).toBeVisible();
  const jordanMember = page.locator('[data-member-form][data-member-id="human-jordan"]');
  await jordanMember.getByLabel("Role").selectOption("viewer");
  await jordanMember.getByRole("button", { name: "Save access" }).click();
  await expect.poll(() => jordanRole).toBe("viewer");
  await page.getByRole("tab", { name: "Data portability", exact: true }).click();
  const accountabilityDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export accountability package/ }).click();
  const downloadedAccountability = await accountabilityDownload;
  expect(downloadedAccountability.suggestedFilename()).toMatch(/^company-os-accountability-\d{4}-\d{2}-\d{2}\.json$/);
  const restoreFile = page.locator("[data-import-company-file]");
  const restoreFixture = {
    name: "company-backup.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ backupVersion: 1, companyId: "company-one" })),
  };
  await restoreFile.setInputFiles(restoreFixture);
  const restoreDialog = page.getByRole("dialog", { name: "Restore Coral Labs Global?" });
  await expect(restoreDialog.getByText("Exact human match")).toBeVisible();
  await expect(restoreDialog.getByText("12 events · 2 delivered publications · 3 checkpoints")).toBeVisible();
  await restoreDialog.getByRole("button", { name: "Cancel" }).click();
  await expect.poll(() => restoreInspectionCount).toBe(1);
  expect(restoreCommandCount).toBe(0);
  await restoreFile.setInputFiles([]);
  await restoreFile.setInputFiles(restoreFixture);
  await page.getByRole("dialog", { name: "Restore Coral Labs Global?" })
    .getByRole("button", { name: "Restore company" }).click();
  await expect.poll(() => restoreCommandCount).toBe(1);
  await page.getByRole("tab", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sign in with enterprise identity" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("company-os.selected-company"))).toBeNull();
});

test("enterprise OIDC invite acceptance creates membership before opening company data", async ({ page }) => {
  const token = "company_os_invite_0123456789abcdefghijklmnopqrstuvwxyz";
  let accepted = false;
  await page.route("**/api/v1/access", async (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({
      schemaVersion: 1, mode: "FORMAL", deploymentProfile: "self-hosted", entryState: "READY",
      identityProvider: { protocol: "OIDC", configured: true }, session: { authenticated: true },
      capabilities: { diagnostics: true, identitySettings: true, companyData: true,
        companyMutation: true, execution: true, approval: true, governance: true }, blockers: [],
    }),
  }));
  await page.route(`**/api/v1/human-invites/${token}/accept`, async (route) => {
    accepted = true;
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({
      accepted: true, companyId: "company-one", membershipRole: "operator",
    }) });
  });
  await page.route("**/api/v1/companies", async (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({
      schemaVersion: 1,
      companies: [{ id: "company-one", name: "Coral Labs", membershipRole: "operator" }],
      isInstanceAdmin: false,
    }),
  }));
  await page.route("**/api/v1/companies/company-one/**", async (route) => {
    if (route.request().url().endsWith("/human-members")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        schemaVersion: 1, members: [],
      }) });
      return;
    }
    await route.fulfill({
      status: 404, contentType: "application/json", body: JSON.stringify({
        error: { code: "ORGANIZATION_NOT_FOUND", parameters: {} },
      }),
    });
  });

  await page.goto(`/invite/${token}`);
  await expect(page.getByRole("heading", { name: "Join this company with your verified identity" })).toBeVisible();
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect.poll(() => accepted).toBe(true);
  await expect.poll(async () => {
    try {
      return await page.evaluate(() => localStorage.getItem("company-os.selected-company"));
    } catch {
      return null;
    }
  }).toBe("company-one");
});

test("Demo Work projects Observed and Federated sources without claiming dispatch", async ({ page }) => {
  await enterDemo(page);
  await page.getByRole("button", { name: "Tasks", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Work across sources" })).toBeVisible();
  await expect(page.getByText("OBSERVED", { exact: true })).toBeVisible();
  await expect(page.getByText("FEDERATED", { exact: true })).toBeVisible();
  await expect(page.getByText("Competitor research from a shared channel · fixture")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open source fixture" })).toHaveCount(2);
});

test("formal running Work requests cancellation and waits for Connector confirmation", async ({ page }) => {
  let attemptStatus = "RUNNING";
  let attemptId = "attempt-one";
  let attemptNumber = 1;
  let reconciliation: { resolution: "SAFE_TO_RETRY"; evidenceId: string; resolvedAt: string } | null = null;
  const organization = {
    company: { id: "company-one", name: "Company One", purpose: "Operate", locale: "en-US" },
    departments: [{ id: "operations", name: "Operations", mandate: "Operate" }],
    projects: [], workspaces: [],
    humans: [{ id: "human-one", name: "Human One", title: "Boss", departmentId: "operations", avatarId: "human-one" }],
    agents: [{ id: "agent-one", name: "Agent One", role: "Research", departmentId: "operations",
      accountableHumanId: "human-one", runtimeConnectorId: "connector-one", avatarId: "fish-one", autonomyLevel: 2 }],
  };
  const work = { id: "work-one", companyId: "company-one", title: "Review customer evidence", goal: "Review customer evidence",
    scope: "AGENT", departmentId: "operations", projectId: null, agentId: "agent-one", requestedBy: "human-one",
    actionIds: ["read-knowledge"], parentWorkId: null, accountableHumanId: "human-one",
    responsibilityContractId: "contract-one", runtimeConnectorId: "connector-one", status: "PENDING" };
  const attempt = () => ({ id: attemptId, workId: "work-one", status: attemptStatus, attemptNumber,
    evidenceReferences: [], resultId: null, reconciliation, preparationStatus: "PREPARED" });
  await page.route("**/api/v1/**", async (route) => {
    const url = route.request().url();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.endsWith("/access")) return json({ schemaVersion: 1, mode: "FORMAL", deploymentProfile: "self-hosted",
      entryState: "READY", identityProvider: { protocol: "OIDC", configured: true }, session: { authenticated: true },
      capabilities: { diagnostics: true, identitySettings: true, companyData: true, companyMutation: true,
        execution: true, approval: true, governance: true }, blockers: [] });
    if (url.endsWith("/companies")) return json({ schemaVersion: 1,
      companies: [{ id: "company-one", name: "Company One", membershipRole: "owner" }], isInstanceAdmin: true });
    if (url.endsWith("/human-members")) return json({ schemaVersion: 1, members: [{ userId: "human-one",
      displayName: "Human One", email: "human@example.com", role: "owner", status: "active",
      createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z" }] });
    if (url.endsWith("/administration")) return json({ schemaVersion: 1, mode: "PRODUCTION",
      viewer: { actorId: "human-one", displayName: "Human One" }, connectorCatalog: { revision: 1, connectors: [] },
      retentionPolicyId: "standard-retention",
      runtimeConnectors: [], secretBrokerRuntime: null, runtimeModelProviders: [], runtimeDataConnectors: [],
      governance: { revision: 0, modelRoutingPolicies: [], dataAuthorizationContracts: [] },
      toolAccess: { companyId: "company-one", revision: 0, profiles: [], entries: [], bindings: [], policies: [] },
      usageBudget: { ledger: { companyId: "company-one", revision: 0, costEvents: [], policies: [] },
        policySummaries: [], totalReportedCostCents: 0, unpricedEventCount: 0 }, egressDecisions: [],
      generatedAt: "2026-08-25T00:00:00.000Z" });
    if (url.endsWith("/planning-catalog")) return json({ companyId: "company-one", revision: 0, goals: [], projects: [] });
    if (url.includes("/work?")) return json({ schemaVersion: 1, items: [{ work, attempts: [attempt()] }], nextCursor: null });
    if (url.includes("/activity?")) return json({ schemaVersion: 1, items: [{
      sequence: 1, id: "activity-one", type: "work.dispatched",
      occurredAt: "2026-08-25T00:00:30.000Z", actorId: "human-one",
      summary: work.title, correlationId: work.id,
    }], nextSequence: null });
    if (/\/work\/work-one\/attempts\/attempt-[a-z]+\/events\?/.test(url)) return json({
      schemaVersion: 1, workId: "work-one", attemptId, nextSequence: null,
      items: [
        { sequence: 4, id: `event-${attemptId}-created`, type: "attempt.state_changed",
          occurredAt: "2026-08-25T00:01:00.000Z", actorId: "human-one",
          summary: `Attempt ${attemptNumber}: ${attemptStatus}`,
          attributes: { operation: "START", status: attemptStatus, attemptNumber } },
        { sequence: 5, id: `event-${attemptId}-progress`, type: "connector.observation",
          occurredAt: "2026-08-25T00:02:00.000Z", actorId: "connector-one",
          summary: "Connector accepted the work", attributes: {
            connectorSequence: 1, status: "WORKING", evidenceCount: 0, resultReference: null,
          } },
      ],
    });
    if (url.endsWith("/accountability-ledger")) return json({
      schemaVersion: 1, companyId: "company-one", approvals: [], evidence: [{
        id: "evidence-one", workId: "work-one", attemptId: "attempt-one", kind: "ARTIFACT",
        summary: "Customer evidence recorded", contentDigest: `sha256:${"e".repeat(64)}`,
        recordedAt: "2026-08-25T00:03:00.000Z", provenance: "PRODUCTION", source: "CONNECTOR",
      }],
      generatedAt: "2026-08-25T00:00:00.000Z",
    });
    if (url.endsWith("/work/work-one/attempts/attempt-one/cancellation")) {
      attemptStatus = "CANCELLATION_REQUESTED"; return json({ ...attempt(), companyId: "company-one" }, 202);
    }
    if (url.endsWith("/work/work-one/attempts/attempt-one/reconciliation")) {
      const body = route.request().postDataJSON() as { resolution: string; evidenceId: string };
      expect(body).toEqual({ resolution: "SAFE_TO_RETRY", evidenceId: "evidence-one" });
      attemptStatus = "FAILED"; reconciliation = { resolution: "SAFE_TO_RETRY", evidenceId: "evidence-one",
        resolvedAt: "2026-08-25T00:05:00.000Z" }; return json({ ...attempt(), companyId: "company-one" });
    }
    if (url.endsWith("/work/work-one/attempts/attempt-one/retry")) {
      attemptStatus = "RUNNING"; attemptId = "attempt-two"; attemptNumber = 2; reconciliation = null;
      return json({ ...attempt(), companyId: "company-one" }, 201);
    }
    return json({ schemaVersion: 1, mode: "PRODUCTION", viewer: { actorId: "human-one", displayName: "Human One" },
      retentionPolicyId: "standard-retention",
      organization, responsibilities: { revision: 1, contracts: [{ id: "contract-one", companyId: "company-one",
        agentId: "agent-one", accountableHumanId: "human-one", backupHumanId: null, autonomyLevel: 2,
        allowedActions: ["read-knowledge"], approvalRequiredActions: [], escalationTimeoutSeconds: null, status: "ACTIVE" }] },
      agentLifecycle: { revision: 1, agents: [{ companyId: "company-one", agentId: "agent-one", status: "idle",
        pauseReason: null, pausedAt: null, errorCode: null, updatedAt: "2026-08-25T00:00:00.000Z",
        eligibility: { assignable: true, invokable: true, assignabilityReason: "eligible", invokabilityReason: "eligible",
          orgChainHealth: { status: "healthy", reason: "healthy", firstInvalidAgentId: null, pausedAncestorIds: [] } } }] },
      work: [work], attempts: [attempt()], pendingApprovals: [], generatedAt: "2026-08-25T00:00:00.000Z" });
  });
  await page.goto("/?mode=formal");
  await page.getByRole("button", { name: "Tasks", exact: true }).first().click();
  await page.getByRole("listitem").filter({ hasText: "Review customer evidence" }).click();
  await page.getByRole("tab", { name: /Activity/ }).click();
  await expect(page.getByRole("tabpanel", { name: "Activity" })).toContainText("Connector accepted the work");
  await page.getByRole("tab", { name: "Details" }).click();
  await page.getByRole("button", { name: "Request cancellation" }).click();
  await expect(page.getByText("Cancellation sent; waiting for Connector confirmation.")).toBeVisible();
  attemptStatus = "OUTCOME_UNKNOWN";
  await page.reload();
  await page.getByRole("button", { name: "Tasks", exact: true }).first().click();
  await page.getByRole("listitem").filter({ hasText: "Review customer evidence" }).click();
  await expect(page.getByText("The external outcome is unknown. Resolve it only with admitted evidence.")).toBeVisible();
  await page.getByLabel("Resolution").selectOption("SAFE_TO_RETRY");
  await page.getByLabel("Admitted evidence ID").fill("evidence-one");
  await page.getByRole("button", { name: "Record reconciliation" }).click();
  await page.getByRole("button", { name: "Retry with current authority" }).click();
  await expect(page.getByRole("button", { name: "Request cancellation" })).toBeVisible();
  await page.locator("[data-close-work-detail]").click();
  await page.getByRole("button", { name: "New Task", exact: true }).click();
  await expect(page.getByLabel("Task title")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Evidence", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "EVIDENCE" })).toBeVisible();
  await expect(page.getByText(`sha256:${"e".repeat(64)}`)).toBeVisible();
});

test("the deterministic Demo reaches an exact human approval and completed evidence chain", async ({ page }) => {
  await enterDemo(page);
  await page.getByRole("button", { name: "Approvals", exact: true }).first().click();
  await page.getByRole("button", { name: "Trigger governed workflow" }).click();
  await expect(page.getByText("AWAITING_APPROVAL", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.locator(".portfolio-approval-card")).toContainText("APPROVED");
  await expect(page.locator(".portfolio-approval-card")).toContainText("2");
});

test("governance exposes each production boundary without secret values", async ({ page }) => {
  await enterDemo(page);
  await page.getByRole("button", { name: "Governance" }).click();
  await expect(page.getByRole("heading", { name: "Governance" })).toBeVisible();
  await expect(page.getByText("PRIVATE_ACTIVITY_EXCLUDED")).toBeVisible();
  await expect(page.getByText(/Inventory Connectors do not claim task control/)).toBeVisible();
  await expect(page.getByText(/deterministic reference data, not a live platform connection/)).toBeVisible();
});

test("concurrent exhibition visitors keep renewal and reset state isolated", async ({ browser }) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  try {
    await enterDemo(first);
    await enterDemo(second);
    await first.getByRole("button", { name: "Usage & Billing", exact: true }).first().click();
    await first.getByRole("button", { name: "Request renewal" }).click();
    await expect(first.getByText("PENDING_APPROVAL", { exact: true })).toBeVisible();

    await second.getByRole("button", { name: "Usage & Billing", exact: true }).first().click();
    await expect(second.getByText("PENDING_APPROVAL", { exact: true })).toBeHidden();

    await first.getByRole("button", { name: "Reset demo" }).click();
    await expect(first.getByText("PENDING_APPROVAL", { exact: true })).toBeHidden();
    await expect(second.getByText("PENDING_APPROVAL", { exact: true })).toBeHidden();
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test("standalone Settings persists English and Chinese product language without changing authored records", async ({ page }) => {
  await enterDemo(page);
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "SETTINGS", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Language" }).click();
  await page.getByRole("radio", { name: /简体中文/ }).click();
  await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "设置", exact: true }).first()).toBeVisible();
  await page.reload();
  await page.locator("[data-enter-demo]").click();
  await expect(page.getByRole("button", { name: "设置", exact: true }).first()).toBeVisible();
  await expect(page.getByText("Coral Labs", { exact: true }).first()).toBeVisible();
});

test("accepted page inventory is reachable through Company OS navigation", async ({ page }) => {
  await enterDemo(page);
  for (const [navigation, heading] of [
    ["Inbox", "INBOX"],
    ["Goals", "GOALS"],
    ["Projects", "PROJECTS"],
    ["Humans", "HUMANS"],
    ["Agents", "Agents"],
    ["Approvals", "Approvals"],
    ["Evidence", "EVIDENCE"],
    ["Activity", "ACTIVITY"],
    ["Usage & Billing", "Usage & Billing"],
  ] as const) {
    await page.getByRole("button", { name: navigation, exact: true }).first().click();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});

for (const viewport of [
  { name: "phone", width: 320, height: 720 },
  { name: "tablet", width: 768, height: 900 },
  { name: "desktop", width: 1440, height: 900 },
] as const) {
  test(`shell, keyboard navigation, and responsive layout work at ${viewport.name}`, async ({ page }) => {
    const browserProblems: string[] = [];
    page.on("pageerror", (error) => browserProblems.push(error.message));
    await page.setViewportSize(viewport);
    await enterDemo(page);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (viewport.width <= 860) await expect(page.getByRole("navigation", { name: "Company OS mobile navigation" })).toBeVisible();
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Go to Company OS" });
    await palette.getByRole("searchbox").fill("Accountability");
    await palette.getByRole("searchbox").press("Enter");
    await expect(page.getByRole("heading", { name: "ACCOUNTABILITY" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(browserProblems).toEqual([]);
  });
}
