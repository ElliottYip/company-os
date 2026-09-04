import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { expect, test } from "@playwright/test";
import { createCompanyDatabase } from "../../adapters/persistence/postgres/company-database.ts";
import { createIsolatedPostgresTestDatabase } from "../support/isolated-postgres-test-database.ts";
import { startReferenceOidcServer } from "../support/reference-oidc-server.ts";
import { availablePort, startCompanyWebEdge, waitForHttp } from "../support/company-web-edge.ts";

const connectionString = process.env.COMPANY_OS_TEST_DATABASE_URL?.trim();

test.use({ ignoreHTTPSErrors: true });

test("real browser completes OIDC, company switching, persistence, and sign-out without route interception", async ({ page }) => {
  test.setTimeout(300_000);
  test.skip(!connectionString, "COMPANY_OS_TEST_DATABASE_URL is not configured");
  const isolated = await createIsolatedPostgresTestDatabase(connectionString as string, "browser_identity");
  const database = createCompanyDatabase(isolated.connectionString);
  const oidc = await startReferenceOidcServer({
    sub: "browser-owner",
    name: "Browser Owner",
    email: "browser-owner@example.test",
  });
  const observations = new Map<string, Record<string, unknown>[]>();
  const cancellableWorkIds = new Set<string>();
  const commands: string[] = [];
  const agentRequests: string[] = [];
  let submitCount = 0;
  let dataAccessAvailable = false;
  let dataAccessCount = 0;
  const dataNode = createServer(async (request, response) => {
    const send = (status: number, value: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(value));
    };
    if (request.headers.authorization !== "Bearer synthetic-browser-data-token" ||
        request.headers["x-company-os-data-connector-protocol"] !== "1.0") {
      return send(401, { error: { code: "AUTHENTICATION_FAILED" } });
    }
    const path = new URL(request.url ?? "/", "http://data-node.test").pathname;
    if (path === "/v1/health") return send(200, { status: "HEALTHY" });
    if (path === "/v1/data-access") {
      dataAccessCount += 1;
      for await (const _chunk of request) { /* drain the synthetic reference-only request */ }
      if (!dataAccessAvailable) return send(503, { error: { code: "SYNTHETIC_DATA_NODE_INTERRUPTED" } });
      return send(200, { result: { type: "GRANTED", dataReference: "data-reference-browser-live",
        evidenceReference: "data-evidence-browser-live", contentDigest: `sha256:${"a".repeat(64)}` } });
    }
    return send(404, { error: { code: "NOT_FOUND" } });
  });
  dataNode.listen(0, "127.0.0.1");
  await once(dataNode, "listening");
  const dataNodeAddress = dataNode.address();
  assert.ok(dataNodeAddress && typeof dataNodeAddress !== "string");
  const agentNode = createServer(async (request, response) => {
    const send = (status: number, value: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(value));
    };
    if (request.headers.authorization !== "Bearer synthetic-browser-approval-token" ||
        request.headers["x-company-os-connector-protocol"] !== "1.0") {
      send(401, { error: { code: "AUTHENTICATION_FAILED" } });
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown> : null;
    const path = new URL(request.url ?? "/", "http://agent-node.test").pathname;
    agentRequests.push(`${request.method ?? "GET"} ${path}`);
    if (path === "/v1/health") return send(200, { status: "HEALTHY" });
    if (path === "/v1/deployments") return send(200, { deploymentId: "deployment-browser-live" });
    if (path === "/v1/work") {
      submitCount += 1;
      const workId = (body?.request as { id?: string } | undefined)?.id;
      if (!workId) return send(422, { error: { code: "WORK_ID_REQUIRED" } });
      const recordedAt = new Date().toISOString();
      if (submitCount === 2) {
        cancellableWorkIds.add(workId);
        observations.set(workId, [{
          workId, sequence: 1, status: "WORKING",
          summary: "Synthetic Connector is processing cancellable work",
          evidenceRefs: [], recordedAt,
        }]);
        return send(202, { accepted: true, executionId: `execution-${workId}` });
      }
      if (submitCount > 2) {
        const evidenceRefs = submitCount === 3 ? ["evidence-retry-live"] : [];
        observations.set(workId, [{
          workId, sequence: 1, status: "WORKING",
          summary: submitCount === 3 ? "Synthetic Connector outcome will require reconciliation" : "Synthetic retry accepted",
          evidenceRefs,
          ...(submitCount === 3 ? { evidenceOutputs: [{ evidenceReference: "evidence-retry-live",
            contentDigest: `sha256:${"e".repeat(64)}` }] } : {}),
          recordedAt,
        }]);
        return send(202, { accepted: true, executionId: `execution-${workId}` });
      }
      observations.set(workId, [{
        workId, sequence: 1, status: "AWAITING_APPROVAL",
        summary: "Human approval required before publishing the formal browser report",
        evidenceRefs: ["evidence-browser-live"],
        evidenceOutputs: [{ evidenceReference: "evidence-browser-live", contentDigest: `sha256:${"b".repeat(64)}` }],
        approvalRequest: {
          requestId: "approval-browser-live",
          expiresAt: new Date(Date.now() + 10_000).toISOString(),
          action: { id: "publish-content", type: "publish", description: "Publish the reviewed formal browser report",
            inputDigest: `sha256:${"c".repeat(64)}`, risk: "HIGH" },
        },
        recordedAt,
      }]);
      return send(202, { accepted: true, executionId: "execution-browser-live" });
    }
    const observationMatch = path.match(/^\/v1\/work\/([^/]+)\/observations$/);
    if (observationMatch) return send(200, { observations: observations.get(observationMatch[1] as string) ?? [] });
    const commandMatch = path.match(/^\/v1\/work\/([^/]+)\/commands$/);
    if (commandMatch) {
      const operation = body?.operation;
      if (typeof operation !== "string") return send(422, { error: { code: "INVALID_OPERATION" } });
      commands.push(operation);
      if (operation === "RESUME") {
        const workId = commandMatch[1] as string;
        observations.set(workId, [
          ...(observations.get(workId) ?? []),
          { workId, sequence: 2, status: "COMPLETED", summary: "Published after exact human approval",
            evidenceRefs: ["evidence-browser-live", "result-browser-live"],
            evidenceOutputs: [
              { evidenceReference: "evidence-browser-live", contentDigest: `sha256:${"b".repeat(64)}` },
              { evidenceReference: "result-browser-live", contentDigest: `sha256:${"d".repeat(64)}` },
            ],
            resultReference: "result-browser-live", recordedAt: new Date().toISOString() },
        ]);
      } else if (operation === "CANCEL" && cancellableWorkIds.has(commandMatch[1] as string)) {
        const workId = commandMatch[1] as string;
        observations.set(workId, [
          ...(observations.get(workId) ?? []),
          { workId, sequence: 2, status: "CANCELLED", summary: "Cancellation confirmed by synthetic Connector",
            evidenceRefs: [], recordedAt: new Date().toISOString() },
        ]);
      }
      return send(202, { accepted: true });
    }
    return send(404, { error: { code: "NOT_FOUND" } });
  });
  agentNode.listen(0, "127.0.0.1");
  await once(agentNode, "listening");
  const agentNodeAddress = agentNode.address();
  assert.ok(agentNodeAddress && typeof agentNodeAddress !== "string");
  const edge = await startCompanyWebEdge(oidc.tlsKey, oidc.tlsCertificate);
  let backend: ChildProcess | null = null;
  const backendPort = await availablePort();
  edge.setBackendPort(backendPort);
  const output: string[] = [];
  const expectConnectorCommand = async (operation: string, timeout = 15_000): Promise<void> => {
    try {
      await expect.poll(() => commands, { timeout }).toContain(operation);
    } catch (error) {
      throw new Error(`Connector command ${operation} was not delivered. Agent requests: ${agentRequests.join(", ")}\nBackend output:\n${output.join("")}`, {
        cause: error,
      });
    }
  };
  const startBackend = async (): Promise<void> => {
    if (backend && backend.exitCode === null && backend.signalCode === null) {
      throw new Error("Company OS service is already running");
    }
    output.length = 0;
    const child = spawn(process.execPath, ["--experimental-strip-types", "adapters/http/service-entry.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_TLS_REJECT_UNAUTHORIZED: "0",
        COMPANY_OS_HOST: "127.0.0.1",
        COMPANY_OS_PORT: String(backendPort),
        COMPANY_OS_PROFILE: "self-hosted",
        COMPANY_OS_EXPOSURE: "private",
        COMPANY_OS_PUBLIC_URL: edge.origin,
        COMPANY_OS_DATABASE_URL: isolated.connectionString,
        COMPANY_OS_OIDC_ISSUER: oidc.issuer,
        COMPANY_OS_OIDC_DISCOVERY_URL: `${oidc.issuer}/.well-known/openid-configuration`,
        COMPANY_OS_OIDC_CLIENT_ID: oidc.clientId,
        COMPANY_OS_OIDC_CLIENT_SECRET: oidc.clientSecret,
        COMPANY_OS_OIDC_REDIRECT_URI: `${edge.origin}/api/auth/oauth2/callback/enterprise-oidc`,
        COMPANY_OS_SESSION_SIGNING_KEY: "browser-admission-session-signing-key-32-bytes-minimum",
        COMPANY_OS_INSTANCE_ID: "browser-admission",
        COMPANY_OS_CONNECTOR_PACKAGES: "@company-os/http-agent-node-connector",
        COMPANY_OS_DATA_CONNECTOR_PACKAGES: "@company-os/http-data-node-connector",
        COMPANY_OS_HTTP_AGENT_NODE_BASE_URL: `http://127.0.0.1:${agentNodeAddress.port}`,
        COMPANY_OS_HTTP_AGENT_NODE_BEARER_TOKEN: "synthetic-browser-approval-token",
        COMPANY_OS_HTTP_AGENT_NODE_ALLOW_INSECURE_LOOPBACK: "true",
        COMPANY_OS_HTTP_AGENT_NODE_MAXIMUM_TIMEOUT_SECONDS: "20",
        COMPANY_OS_HTTP_DATA_NODE_SOURCES: "crm-browser-live",
        COMPANY_OS_HTTP_DATA_NODE_OPERATIONS: "READ",
        COMPANY_OS_HTTP_DATA_NODE_BASE_URL: `http://127.0.0.1:${dataNodeAddress.port}`,
        COMPANY_OS_HTTP_DATA_NODE_BEARER_TOKEN: "synthetic-browser-data-token",
        COMPANY_OS_HTTP_DATA_NODE_ALLOW_INSECURE_LOOPBACK: "true",
        COMPANY_OS_CONNECTOR_REDRIVE_INTERVAL_MS: "10000",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    backend = child;
    child.stdout?.on("data", (chunk) => output.push(String(chunk)));
    child.stderr?.on("data", (chunk) => output.push(String(chunk)));
    await waitForHttp(`http://127.0.0.1:${backendPort}/health`, child, output);
  };
  const stopBackend = async (): Promise<void> => {
    const child = backend;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    child.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((resolve) => child.once("exit", () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 3_000)),
    ]);
    if (child.exitCode === null && child.signalCode === null) {
      const killed = new Promise<void>((resolve) => child.once("exit", () => resolve()));
      child.kill("SIGKILL");
      await killed;
    }
  };
  try {
    await database.migrate();
    await database.close();
    await startBackend();

    await page.goto(`${edge.origin}/?mode=formal`);
    await expect(page.getByRole("heading", { name: "Claim this private instance" })).toBeVisible();
    await page.getByRole("button", { name: "Claim first administrator" }).click();
    await expect(page.getByRole("heading", { name: "Create your first company" })).toBeVisible();
    await page.getByLabel("Company name").fill("Northstar Operations");
    await page.getByLabel("Company purpose").fill("Operate accountable human and Agent teams.");
    await page.locator("[data-formal-company-form]").getByRole("button", { name: "Create company" }).click();
    await expect(page.getByRole("heading", { name: "Set up the accountable owner" })).toBeVisible();
    await page.getByLabel("Department name").fill("Operations");
    await page.getByLabel("Your company title").fill("Operations Owner");
    await page.getByRole("button", { name: "Create organization" }).click();
    await expect(page.getByRole("navigation", { name: "Company OS sections" })).toBeVisible();
    await expect(page.locator(".sidebar-brand strong")).toHaveText("Northstar Operations");

    const secondCompany = await page.evaluate(async () => {
      const companyResponse = await fetch("/api/v1/companies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Coral Research",
          purpose: "Research with explicit evidence and responsibility.",
          locale: "en-US",
        }),
      });
      if (!companyResponse.ok) throw new Error(`company creation failed: ${companyResponse.status}`);
      const company = await companyResponse.json() as { companyId: string };
      const organizationResponse = await fetch(`/api/v1/companies/${company.companyId}/organization`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ departmentName: "Research", ownerTitle: "Research Owner" }),
      });
      if (!organizationResponse.ok) throw new Error(`organization creation failed: ${organizationResponse.status}`);
      return company;
    });
    assert.match(secondCompany.companyId, /^[a-z0-9][a-z0-9-]{0,63}$/);

    await page.reload();
    await page.locator("[data-company-menu-trigger]").click();
    await page.getByRole("menuitemradio", { name: /Coral Research/ }).click();
    await expect(page.locator(".sidebar-brand strong")).toHaveText("Coral Research");
    await expect(page.locator(".topbar-breadcrumb")).toContainText("Coral Research");
    await page.reload();
    await expect(page.locator(".sidebar-brand strong")).toHaveText("Coral Research");

    await stopBackend();
    await page.reload();
    await expect(page.getByRole("heading", {
      name: "Company OS is unreachable. Your current page and input have been preserved.",
    })).toBeVisible();
    await expect(page.getByText("FORMAL_API_UNREACHABLE", { exact: true })).toBeVisible();
    await startBackend();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.locator(".sidebar-brand strong")).toHaveText("Coral Research");
    await expect(page.locator(".topbar-breadcrumb")).toContainText("Coral Research");

    await page.getByRole("button", { name: "Governance", exact: true }).first().click();
    await expect(page.getByText("Runtime package installed; register it in this company before Agent admission.")).toBeVisible();
    await page.getByRole("button", { name: "Register runtime", exact: true }).click();
    await expect(page.getByRole("button", { name: "Disable", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Organization", exact: true }).first().click();
    await page.getByRole("button", { name: "Add Agent", exact: true }).click();
    const agentDialog = page.getByRole("dialog", { name: "Add an Agent colleague" });
    await agentDialog.getByLabel("Agent name").fill("Publishing Assistant");
    await agentDialog.getByLabel("Role", { exact: true }).fill("Publish approved reports with evidence");
    await agentDialog.getByLabel("Runtime Connector").selectOption("http-agent-node");
    await agentDialog.getByRole("button", { name: "Add Agent", exact: true }).click();

    await page.getByRole("button", { name: "Agents", exact: true }).first().click();
    await page.getByText("Action policy", { exact: true }).click();
    await page.getByLabel("publish-content policy").selectOption("approval");
    await page.getByRole("button", { name: "Save action policy", exact: true }).click();
    await page.getByRole("button", { name: "Activate responsibility", exact: true }).click();
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.getByText("IDLE", { exact: true })).toBeVisible();

    const agentAdmission = await page.evaluate(async () => {
      const companyId = localStorage.getItem("company-os.selected-company");
      const response = await fetch(`/api/v1/companies/${companyId}/agent-boss`);
      const projection = await response.json() as {
        responsibilities?: { contracts?: { agentId: string; status: string; allowedActions: string[]; approvalRequiredActions: string[] }[] };
        agentLifecycle?: { agents?: { agentId: string; status: string; eligibility: { assignable: boolean; invokable: boolean; assignabilityReason: string; invokabilityReason: string } }[] };
      };
      return {
        responseStatus: response.status,
        contract: projection.responsibilities?.contracts?.find(({ agentId }) => agentId === "agent-publishing-assistant"),
        lifecycle: projection.agentLifecycle?.agents?.find(({ agentId }) => agentId === "agent-publishing-assistant"),
      };
    });
    assert.equal(agentAdmission.responseStatus, 200);
    assert.equal(agentAdmission.contract?.agentId, "agent-publishing-assistant");
    assert.equal(agentAdmission.contract?.status, "ACTIVE");
    assert.deepEqual(agentAdmission.contract?.allowedActions,
      ["read-knowledge", "draft-content", "publish-content"]);
    assert.deepEqual(agentAdmission.contract?.approvalRequiredActions, ["publish-content"]);
    assert.equal(agentAdmission.lifecycle?.agentId, "agent-publishing-assistant");
    assert.equal(agentAdmission.lifecycle?.status, "idle");
    assert.deepEqual({
      assignable: agentAdmission.lifecycle?.eligibility.assignable,
      invokable: agentAdmission.lifecycle?.eligibility.invokable,
      assignabilityReason: agentAdmission.lifecycle?.eligibility.assignabilityReason,
      invokabilityReason: agentAdmission.lifecycle?.eligibility.invokabilityReason,
    }, {
      assignable: true,
      invokable: true,
      assignabilityReason: "eligible",
      invokabilityReason: "eligible",
    });

    await page.getByRole("button", { name: "Governance", exact: true }).first().click();
    await page.getByRole("tab", { name: "Data authorization", exact: true }).click();
    await expect(page.getByText("Enterprise HTTP Data Node", { exact: true })).toBeVisible();
    await page.getByLabel("Contract ID").fill("crm-browser-read");
    await page.getByLabel("Data source ID").fill("crm-browser-live");
    await page.getByLabel("Authorized Agent").selectOption("agent-publishing-assistant");
    await page.getByLabel("Purpose", { exact: true }).fill("customer-report");
    await page.getByLabel("Maximum classification").selectOption("CONFIDENTIAL");
    await page.getByLabel("Valid until").fill("2026-12-31T23:59");
    await page.getByLabel("Operations").selectOption("READ");
    await page.getByRole("button", { name: "Create active grant" }).click();
    await expect(page.getByText("crm-browser-read", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Tasks", exact: true }).first().click();
    await page.getByRole("button", { name: "New Task", exact: true }).click();
    await page.getByLabel("Task title").fill("Publish formal browser report");
    await page.getByLabel("Desired outcome").fill("Publish only after an exact accountable-human decision and preserve evidence.");
    await page.getByLabel("Executing Agent").selectOption("agent-publishing-assistant");
    await page.getByRole("button", { name: "Assign task", exact: true }).click();
    await test.step("Connector accepts the task exactly once", async () => {
      await expect.poll(() => submitCount, { timeout: 15_000 }).toBe(1);
    });

    await test.step("service restart collects approval and delivers PAUSE", async () => {
      await stopBackend();
      await startBackend();
      await expectConnectorCommand("PAUSE", 30_000);
    });
    await page.reload();
    await page.getByRole("button", { name: "Approvals", exact: true }).first().click();
    await expect(page.getByText("DECISION REQUIRED", { exact: true })).toBeVisible();
    await expect(page.getByText("Publish formal browser report", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Approve", exact: true }).click();

    await test.step("service restart delivers RESUME and collects the result", async () => {
      await stopBackend();
      await startBackend();
      await expectConnectorCommand("RESUME", 30_000);
    });
    await expect.poll(async () => page.evaluate(async () => {
      const response = await fetch("/api/v1/companies/" + localStorage.getItem("company-os.selected-company") + "/agent-boss");
      if (!response.ok) return "HTTP_" + response.status;
      const projection = await response.json() as { attempts?: { status?: string }[] };
      return projection.attempts?.at(-1)?.status ?? "MISSING";
    }), { timeout: 15_000 }).toBe("SUCCEEDED");
    await page.reload();
    await page.getByRole("button", { name: "Evidence", exact: true }).first().click();
    await expect(page.getByText("evidence-browser-live", { exact: true })).toBeVisible();
    await expect(page.getByText("result-browser-live", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Activity", exact: true }).first().click();
    await expect(page.getByText("Published after exact human approval", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Approvals", exact: true }).first().click();
    await expect(page.getByText("APPROVED", { exact: true })).toBeVisible();
    assert.equal(submitCount, 1);
    assert.deepEqual(commands, ["PAUSE", "RESUME"]);

    let accountabilityCommand: { requestId: string; purposeCode: string } | null = null;
    page.on("request", (request) => {
      if (request.url().endsWith("/accountability-exports") && request.method() === "POST") {
        accountabilityCommand = request.postDataJSON() as { requestId: string; purposeCode: string };
      }
    });
    await page.getByRole("button", { name: "Settings", exact: true }).first().click();
    await page.getByRole("tab", { name: "Data portability", exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /^Export accountability package/ }).click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /^company-os-accountability-\d{4}-\d{2}-\d{2}\.json$/);
    const stream = await download.createReadStream();
    assert.ok(stream);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const accountabilityPackage = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
    assert.equal(accountabilityPackage.packageType, "COMPANY_OS_ACCOUNTABILITY_EXPORT");
    assert.equal(accountabilityPackage.companyId, secondCompany.companyId);
    assert.deepEqual(accountabilityPackage.policy, {
      retentionPolicyId: "standard-retention",
      exportPolicyId: "standard-accountability-export",
      purposeCode: "AUDIT_REVIEW",
    });
    const approvals = accountabilityPackage.approvals as { request: { id: string;
      binding: { accountableHumanId: string; workId: string } }; status: string }[];
    const evidence = accountabilityPackage.evidence as { id: string; contentDigest: string }[];
    const responsibilities = accountabilityPackage.responsibilities as {
      workId: string; accountableHumanId: string; executingAgentId: string;
      approvalReferences: string[]; evidenceReferences: string[]; resultReference: string | null;
    }[];
    assert.deepEqual(approvals.map(({ request, status }) => ({ id: request.id, status })), [
      { id: "approval-browser-live", status: "APPROVED" },
    ]);
    assert.deepEqual(evidence.map(({ id }) => id).sort(), ["evidence-browser-live", "result-browser-live"]);
    assert.equal(responsibilities.length, 1);
    assert.match(responsibilities[0]?.accountableHumanId ?? "", /^[a-z0-9][a-z0-9-]{0,63}$/);
    assert.equal(responsibilities[0]?.accountableHumanId,
      approvals[0]?.request.binding.accountableHumanId);
    assert.equal(responsibilities[0]?.workId, approvals[0]?.request.binding.workId);
    assert.equal(responsibilities[0]?.executingAgentId, "agent-publishing-assistant");
    assert.deepEqual(responsibilities[0]?.approvalReferences, ["approval-browser-live"]);
    assert.deepEqual(responsibilities[0]?.evidenceReferences.sort(), ["evidence-browser-live", "result-browser-live"]);
    assert.equal(responsibilities[0]?.resultReference, "result-browser-live");
    const { digest, ...unsignedPackage } = accountabilityPackage;
    assert.equal(digest, `sha256:${createHash("sha256").update(JSON.stringify(unsignedPackage)).digest("hex")}`);
    assert.doesNotMatch(JSON.stringify(accountabilityPackage),
      /synthetic-browser-(?:approval|data)-token|vendorSession|rawOutput|rawEnterpriseRecord|reasoning/i);
    assert.ok(accountabilityCommand);
    assert.match(accountabilityCommand.requestId, /^audit-[a-f0-9-]{36}$/);
    assert.equal(accountabilityCommand.purposeCode, "AUDIT_REVIEW");

    await stopBackend();
    await startBackend();
    await page.reload();
    const replayPackage = await page.evaluate(async ({ command }) => {
      const companyId = localStorage.getItem("company-os.selected-company");
      const response = await fetch(`/api/v1/companies/${companyId}/accountability-exports`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command),
      });
      if (!response.ok) throw new Error(`accountability replay failed: ${response.status}`);
      return (await response.json() as { package: unknown }).package;
    }, { command: accountabilityCommand });
    assert.deepEqual(replayPackage, accountabilityPackage);

    await page.getByRole("button", { name: "Tasks", exact: true }).first().click();
    await page.getByRole("button", { name: "New Task", exact: true }).click();
    await page.getByLabel("Task title").fill("Cancel formal browser work");
    await page.getByLabel("Desired outcome").fill("Stop external work and wait for Connector confirmation.");
    await page.getByLabel("Executing Agent").selectOption("agent-publishing-assistant");
    await page.getByRole("button", { name: "Assign task", exact: true }).click();
    await expect.poll(() => submitCount, { timeout: 15_000 }).toBe(2);
    await stopBackend();
    await startBackend();
    await page.reload();
    await page.getByRole("button", { name: "Tasks", exact: true }).first().click();
    await page.getByRole("listitem").filter({ hasText: "Cancel formal browser work" }).click();
    await page.getByRole("button", { name: "Request cancellation" }).click();
    await expect(page.getByText("Cancellation sent; waiting for Connector confirmation.")).toBeVisible();
    await expectConnectorCommand("CANCEL");
    await stopBackend();
    await startBackend();
    await expect.poll(async () => page.evaluate(async () => {
      const response = await fetch("/api/v1/companies/" + localStorage.getItem("company-os.selected-company") + "/agent-boss");
      if (!response.ok) return "HTTP_" + response.status;
      const projection = await response.json() as { work?: { id: string; title: string }[];
        attempts?: { workId: string; status?: string }[] };
      const workId = projection.work?.find(({ title }) => title === "Cancel formal browser work")?.id;
      return projection.attempts?.find((attempt) => attempt.workId === workId)?.status ?? "MISSING";
    }), { timeout: 15_000 }).toBe("CANCELLED");
    assert.equal(submitCount, 2);
    assert.deepEqual(commands, ["PAUSE", "RESUME", "CANCEL"]);

    await page.reload();
    await page.getByRole("button", { name: "Tasks", exact: true }).first().click();
    await page.getByRole("button", { name: "New Task", exact: true }).click();
    await page.getByLabel("Task title").fill("Reconcile unknown formal outcome");
    await page.getByLabel("Desired outcome").fill("Never retry a possibly side-effecting run without admitted evidence.");
    await page.getByLabel("Executing Agent").selectOption("agent-publishing-assistant");
    await page.getByRole("button", { name: "Assign task", exact: true }).click();
    await expect.poll(() => submitCount, { timeout: 15_000 }).toBe(3);
    await stopBackend();
    await startBackend();
    await new Promise((resolve) => setTimeout(resolve, 21_000));
    await stopBackend();
    await startBackend();
    await expect.poll(async () => page.evaluate(async () => {
      const response = await fetch("/api/v1/companies/" + localStorage.getItem("company-os.selected-company") + "/agent-boss");
      if (!response.ok) return "HTTP_" + response.status;
      const projection = await response.json() as { work?: { id: string; title: string }[];
        attempts?: { workId: string; status?: string }[] };
      const workId = projection.work?.find(({ title }) => title === "Reconcile unknown formal outcome")?.id;
      return projection.attempts?.find((attempt) => attempt.workId === workId)?.status ?? "MISSING";
    }), { timeout: 15_000 }).toBe("OUTCOME_UNKNOWN");
    await page.reload();
    await page.getByRole("button", { name: "Tasks", exact: true }).first().click();
    await page.getByRole("listitem").filter({ hasText: "Reconcile unknown formal outcome" }).click();
    await expect(page.getByText("The external outcome is unknown. Resolve it only with admitted evidence.")).toBeVisible();
    await page.getByLabel("Resolution").selectOption("SAFE_TO_RETRY");
    await page.getByLabel("Admitted evidence ID").fill("evidence-retry-live");
    await page.getByRole("button", { name: "Record reconciliation" }).click();
    await page.getByRole("button", { name: "Retry with current authority" }).click();
    await expect.poll(() => submitCount, { timeout: 15_000 }).toBe(4);
    await expect(page.getByRole("button", { name: "Request cancellation" })).toBeVisible();

    await page.locator("[data-close-work-detail]").click();
    await page.getByRole("button", { name: "New Task", exact: true }).click();
    await page.getByLabel("Task title").fill("Recover interrupted governed preparation");
    await page.getByLabel("Desired outcome").fill("Read only the authorized customer reference, then recover explicitly after interruption.");
    await page.getByLabel("Executing Agent").selectOption("agent-publishing-assistant");
    await page.getByText("Enterprise data access (optional)", { exact: true }).click();
    await page.getByLabel("Authorization contract").selectOption("crm-browser-read");
    await expect(page.locator('[data-new-task-dialog] select[name="dataOperation"]')).toHaveValue("READ");
    await page.getByLabel("Authorized purpose").fill("customer-report");
    await page.getByLabel("Data classification").selectOption("CONFIDENTIAL");
    await page.getByRole("button", { name: "Assign task", exact: true }).click();
    await expect(page.locator("[data-action-failure]")).toContainText("OPERATION_REJECTED");
    await expect.poll(() => dataAccessCount, { timeout: 15_000 }).toBe(1);
    assert.equal(submitCount, 4);
    dataAccessAvailable = true;
    await page.reload();
    await page.getByRole("button", { name: "Tasks", exact: true }).first().click();
    await page.getByRole("listitem").filter({ hasText: "Recover interrupted governed preparation" }).click();
    await expect(page.getByText("Execution preparation was interrupted before the Connector received this task.")).toBeVisible();
    await page.getByRole("button", { name: "Resume execution preparation" }).click();
    await expect.poll(() => dataAccessCount, { timeout: 15_000 }).toBe(2);
    await expect.poll(() => submitCount, { timeout: 15_000 }).toBe(5);

    await page.getByRole("button", { name: "Settings" }).first().click();
    await page.getByRole("tab", { name: "Profile" }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Sign in with enterprise identity" })).toBeVisible();
    await expect(page.getByText("FORMAL_IDENTITY_REQUIRED", { exact: true })).toBeVisible();
  } finally {
    await stopBackend();
    await edge.close();
    agentNode.closeAllConnections();
    await new Promise<void>((resolve) => agentNode.close(() => resolve()));
    dataNode.closeAllConnections();
    await new Promise<void>((resolve) => dataNode.close(() => resolve()));
    await oidc.close();
    await database.close();
    await isolated.dispose();
  }
});
