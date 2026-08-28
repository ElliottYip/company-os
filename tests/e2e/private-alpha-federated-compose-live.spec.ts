import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test } from "@playwright/test";

const configuration = {
  webOrigin: process.env.COMPANY_OS_COMPOSE_WEB_ORIGIN?.trim(),
  apiOrigin: process.env.COMPANY_OS_COMPOSE_API_ORIGIN?.trim(),
  identityHost: process.env.COMPANY_OS_COMPOSE_IDENTITY_HOST?.trim(),
  username: process.env.COMPANY_OS_COMPOSE_TEST_USERNAME?.trim(),
  password: process.env.COMPANY_OS_COMPOSE_TEST_PASSWORD?.trim(),
  paperclipAdminBaseUrl: process.env.COMPANY_OS_COMPOSE_PAPERCLIP_ADMIN_BASE_URL?.trim(),
  paperclipAdminEmail: process.env.COMPANY_OS_COMPOSE_PAPERCLIP_ADMIN_EMAIL?.trim(),
  paperclipAdminPassword: process.env.COMPANY_OS_COMPOSE_PAPERCLIP_ADMIN_PASSWORD?.trim(),
  paperclipKeyId: process.env.COMPANY_OS_COMPOSE_PAPERCLIP_KEY_ID?.trim(),
  paperclipSecretFile: process.env.COMPANY_OS_COMPOSE_PAPERCLIP_SECRET_FILE?.trim(),
  paperclipSecretVolume: process.env.COMPANY_OS_COMPOSE_PAPERCLIP_SECRET_VOLUME?.trim(),
  apiImage: process.env.COMPANY_OS_COMPOSE_API_IMAGE?.trim(),
  paperclipExternalCompanyId: process.env.COMPANY_OS_COMPOSE_PAPERCLIP_EXTERNAL_COMPANY_ID?.trim(),
  paperclipExternalAgentId: process.env.COMPANY_OS_COMPOSE_PAPERCLIP_EXTERNAL_AGENT_ID?.trim(),
  ancCompanyId: process.env.COMPANY_OS_COMPOSE_ANC_COMPANY_ID?.trim(),
  ancHumanId: process.env.COMPANY_OS_COMPOSE_ANC_HUMAN_ID?.trim(),
};
const configured = Object.values(configuration).every((value) => Boolean(value));
const resolver = configured ? "MAP * 127.0.0.1, EXCLUDE localhost" : "";

test.use({
  ignoreHTTPSErrors: true,
  launchOptions: { args: resolver ? ["--no-proxy-server", `--host-resolver-rules=${resolver}`] : [] },
});

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  return value as JsonRecord;
}

function records(value: unknown, label: string): JsonRecord[] {
  assert(Array.isArray(value), `${label} must be an array`);
  return value.map((item) => record(item, label));
}

async function paperclipAdminSession(): Promise<(path: string, init?: RequestInit) => Promise<Response>> {
  const cookies = new Map<string, string>();
  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${configuration.paperclipAdminBaseUrl}${path}`, {
      ...init,
      redirect: "manual",
      headers: {
        accept: "application/json",
        origin: configuration.paperclipAdminBaseUrl as string,
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        ...(cookies.size === 0 ? {} : {
          cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
        }),
        ...init.headers,
      },
    });
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(";", 1)[0] ?? "";
      const separator = pair.indexOf("=");
      if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    return response;
  };
  const signIn = await request("/api/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify({
      email: configuration.paperclipAdminEmail,
      password: configuration.paperclipAdminPassword,
    }),
  });
  assert.equal(signIn.ok, true, `Paperclip synthetic admin sign-in failed with HTTP ${signIn.status}`);
  assert(cookies.size > 0, "Paperclip synthetic admin session cookie is missing");
  return request;
}

test("formal Alpha synchronizes, replays, fails closed after revocation, and recovers after rotation", async ({ page }) => {
  test.skip(!configured, "private Alpha Federated Compose admission environment is not configured");
  await page.goto(`${configuration.webOrigin}/?mode=formal`);
  await expect(page).toHaveURL(/\/protocol\/openid-connect\/auth/);
  await page.locator("#username").fill(configuration.username as string);
  await page.locator("#password").fill(configuration.password as string);
  await page.locator("#kc-login").click();
  await expect(page).toHaveURL(`${configuration.webOrigin}/?mode=formal`);
  await expect(page.locator(".sidebar-brand strong")).toHaveText("Compose Admission Company");

  const companyId = configuration.ancCompanyId as string;
  const apiOrigin = configuration.apiOrigin as string;
  const synchronize = async () => page.evaluate(async ({ origin, company }) => {
    const response = await fetch(
      `${origin}/api/v1/companies/${company}/portfolio-sources/paperclip-alpha/synchronize`,
      { method: "POST", credentials: "include" },
    );
    return { status: response.status, value: await response.json() };
  }, { origin: apiOrigin, company: companyId });
  const get = async (path: string) => page.evaluate(async ({ origin, value }) => {
    const response = await fetch(`${origin}${value}`, { credentials: "include" });
    return { status: response.status, value: await response.json() };
  }, { origin: apiOrigin, value: path });

  const first = await synchronize();
  expect(first.status).toBe(200);
  assert.equal(record(first.value, "first synchronization").connectorId, "paperclip-alpha");
  assert.deepEqual(record(first.value, "first synchronization").inventory,
    { recorded: 2, replayed: 0, updated: 0 });
  assert.deepEqual(record(first.value, "first synchronization").work,
    { recorded: 1, replayed: 0, updated: 0 });
  assert.match(JSON.stringify(first.value), /RECORDED|recorded/);

  const replay = await synchronize();
  expect(replay.status).toBe(200);
  assert.deepEqual(record(replay.value, "replayed synchronization").inventory,
    { recorded: 0, replayed: 1, updated: 1 });
  assert.deepEqual(record(replay.value, "replayed synchronization").work,
    { recorded: 0, replayed: 1, updated: 0 });
  assert.match(JSON.stringify(replay.value), /REPLAYED|replayed/);

  const agentsResponse = await get(`/api/v1/companies/${companyId}/agent-portfolio`);
  expect(agentsResponse.status).toBe(200);
  const agents = records(agentsResponse.value, "Agent Portfolio");
  const runtime = agents.find((item) => item.id === "paperclip-runtime");
  const mapped = agents.find((item) => item.id === "paperclip-research-agent");
  assert.equal(runtime?.agentClass, "FEDERATED_RUNTIME");
  assert.equal(runtime?.managementDepth, "FEDERATED");
  assert.equal(runtime?.executionOwner, "EXTERNAL_PLATFORM");
  assert.equal(mapped?.agentClass, "SHARED");
  assert.equal(mapped?.managementDepth, "OBSERVED");
  assert.equal(mapped?.accountableHumanId, configuration.ancHumanId);
  assert.equal(record(mapped?.source, "mapped Agent source").externalId,
    `agent:${configuration.paperclipExternalAgentId}`);

  const workResponse = await get(`/api/v1/companies/${companyId}/portfolio-work`);
  expect(workResponse.status).toBe(200);
  const work = records(workResponse.value, "Portfolio Work");
  assert.equal(work.length, 1);
  assert.equal(work[0]?.mode, "FEDERATED");
  assert.equal(work[0]?.agentId, "paperclip-research-agent");
  assert.equal(record(work[0]?.source, "Federated Work source").workspaceReference,
    `company:${configuration.paperclipExternalCompanyId}`);
  assert.doesNotMatch(JSON.stringify(work), /Private synthetic body that must never cross/i);

  const healthyAdministration = await get(`/api/v1/companies/${companyId}/administration`);
  expect(healthyAdministration.status).toBe(200);
  const healthySources = records(
    record(healthyAdministration.value, "Administration").runtimeFederatedSources,
    "runtimeFederatedSources",
  );
  const healthySource = healthySources.find((item) => item.connectorId === "paperclip-alpha");
  assert.equal(healthySource?.health, "HEALTHY");
  assert.deepEqual(healthySource?.dataCapabilities,
    ["AGENT_INVENTORY", "FEDERATED_WORK", "RESULT_REFERENCES"]);
  assert.deepEqual(healthySource?.controlCapabilities, ["SYNCHRONIZE_FEDERATED_RECORDS"]);
  const lastSuccessfulAt = healthySource?.lastSuccessfulAt;
  assert.equal(typeof lastSuccessfulAt, "string");

  const paperclip = await paperclipAdminSession();
  const revoke = await paperclip(`/api/board-api-keys/${configuration.paperclipKeyId}`, {
    method: "DELETE",
  });
  assert.equal(revoke.ok, true, `Paperclip key revocation failed with HTTP ${revoke.status}`);

  const denied = await synchronize();
  expect(denied.status).toBe(503);
  assert.equal(record(record(denied.value, "denied synchronization").error, "error").code,
    "FEDERATED_SOURCE_UNAVAILABLE");

  const unavailableAdministration = await get(`/api/v1/companies/${companyId}/administration`);
  const unavailableSources = records(
    record(unavailableAdministration.value, "Administration").runtimeFederatedSources,
    "runtimeFederatedSources",
  );
  const unavailableSource = unavailableSources.find((item) => item.connectorId === "paperclip-alpha");
  assert.equal(unavailableSource?.health, "UNAVAILABLE");
  assert.equal(unavailableSource?.lastSuccessfulAt, lastSuccessfulAt);

  const createKey = await paperclip("/api/board-api-keys", {
    method: "POST",
    body: JSON.stringify({
      name: `anc-synthetic-rotation-${Date.now()}`,
      requestedCompanyId: configuration.paperclipExternalCompanyId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }),
  });
  assert.equal(createKey.status, 201, `Paperclip key rotation failed with HTTP ${createKey.status}`);
  const rotatedKey = record(await createKey.json(), "rotated Paperclip key");
  assert.equal(typeof rotatedKey.token, "string");
  assert.match(rotatedKey.token as string, /^pcp_board_/);
  const nextCredentialPath = `${configuration.paperclipSecretFile}.next-${process.pid}`;
  writeFileSync(nextCredentialPath, rotatedKey.token as string,
    { encoding: "utf8", mode: 0o600, flag: "wx" });
  chmodSync(nextCredentialPath, 0o600);
  renameSync(nextCredentialPath, configuration.paperclipSecretFile as string);
  execFileSync("docker", [
    "run", "--rm", "--user", "0:0",
    "--volume", `${configuration.paperclipSecretVolume}:/destination`,
    "--volume", `${dirname(configuration.paperclipSecretFile as string)}:/source:ro`,
    "--entrypoint", "node", configuration.apiImage as string, "-e",
    "const f=require('node:fs');f.copyFileSync('/source/paperclip-board-key','/destination/paperclip-board-key.next');f.chownSync('/destination/paperclip-board-key.next',1000,1000);f.chmodSync('/destination/paperclip-board-key.next',0o600);f.renameSync('/destination/paperclip-board-key.next','/destination/paperclip-board-key')",
  ], { stdio: "ignore" });

  const recovered = await synchronize();
  expect(recovered.status).toBe(200);
  assert.deepEqual(record(recovered.value, "recovered synchronization").inventory,
    { recorded: 0, replayed: 1, updated: 1 });
  assert.deepEqual(record(recovered.value, "recovered synchronization").work,
    { recorded: 0, replayed: 1, updated: 0 });

  const recoveredAdministration = await get(`/api/v1/companies/${companyId}/administration`);
  const recoveredSources = records(
    record(recoveredAdministration.value, "Administration").runtimeFederatedSources,
    "runtimeFederatedSources",
  );
  assert.equal(recoveredSources.find((item) => item.connectorId === "paperclip-alpha")?.health, "HEALTHY");

  const finalRevoke = await paperclip(`/api/board-api-keys/${rotatedKey.id}`, { method: "DELETE" });
  assert.equal(finalRevoke.ok, true, `Rotated Paperclip key cleanup failed with HTTP ${finalRevoke.status}`);
});
