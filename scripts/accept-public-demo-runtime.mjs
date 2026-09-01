import assert from "node:assert/strict";

const [apiOrigin, webOrigin, expectedReleaseId, browserOrigin = webOrigin] = process.argv.slice(2);
if (!apiOrigin || !webOrigin) {
  throw new Error(
    "USAGE: node scripts/accept-public-demo-runtime.mjs <api-origin> <web-origin> [release-id]",
  );
}

async function response(path, init = {}, expectedStatus = 200) {
  const result = await fetch(`${apiOrigin}${path}`, init);
  assert.equal(result.status, expectedStatus, `${path} returned ${result.status}`);
  return result;
}

async function json(path, init = {}, expectedStatus = 200) {
  return response(path, init, expectedStatus).then((result) => result.json());
}

async function createSession() {
  const result = await response("/api/demo/v2/sessions", {
    method: "POST",
    headers: { origin: browserOrigin },
  }, 201);
  const setCookie = result.headers.get("set-cookie");
  assert.match(setCookie ?? "", /^company-os-demo-session=/);
  assert.match(setCookie ?? "", /HttpOnly/);
  assert.match(setCookie ?? "", /SameSite=Lax/);
  const body = await result.json();
  assert.equal("sessionId" in body, false);
  assert.equal(body.company.name, "Northstar Analytics · Demo Fixture");
  assert.equal(body.provenance, "DEMO_FIXTURE");
  return { cookie: setCookie.split(";")[0], body };
}

const health = await json("/health");
assert.equal(health.status, "ok");
const ready = await json("/ready");
assert.equal(ready.status, "ready");
assert.equal(ready.mode, "DEMO_FIXTURE");
for (const check of Object.values(ready.checks)) assert.equal(check.status, "pass");

const web = await fetch(webOrigin);
assert.equal(web.status, 200);
assert.equal(web.headers.get("x-company-os-release-id"), expectedReleaseId ?? null);
assert.match(await web.text(), /Company OS|ANC/);

const first = await createSession();
const second = await createSession();
assert.deepEqual(
  new Set(first.body.agents.map(({ agentClass }) => agentClass)),
  new Set(["PERSONAL", "SHARED", "FEDERATED_RUNTIME"]),
);
assert.deepEqual(
  new Set(first.body.agents.map(({ managementDepth }) => managementDepth)),
  new Set(["INVENTORY", "OBSERVED", "GOVERNED", "FEDERATED"]),
);

const renewal = await json("/api/demo/v2/actions", {
  method: "POST",
  headers: {
    cookie: first.cookie,
    origin: browserOrigin,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    action: "REQUEST_RENEWAL",
    targetType: "CREDENTIAL",
    targetId: "credential-elliott",
    reason: "RC8 Alpha acceptance fixture renewal.",
  }),
});
assert.equal(renewal.commercial.renewals.length, 1);

const isolated = await json("/api/demo/v2/session", {
  headers: { cookie: second.cookie },
});
assert.equal(isolated.commercial.renewals.length, 0);

const paused = await json("/api/demo/v2/actions", {
  method: "POST",
  headers: {
    cookie: first.cookie,
    origin: browserOrigin,
    "content-type": "application/json",
  },
  body: JSON.stringify({ action: "TRIGGER_GOVERNED" }),
});
assert.equal(paused.governed.phase, "AWAITING_APPROVAL");
assert.equal(paused.governed.evidenceReferences.length, 2);
assert.equal(paused.governed.costCents, 32);

const approved = await json("/api/demo/v2/actions", {
  method: "POST",
  headers: {
    cookie: first.cookie,
    origin: browserOrigin,
    "content-type": "application/json",
  },
  body: JSON.stringify({ action: "DECIDE", decision: "APPROVED" }),
});
assert.equal(approved.governed.phase, "APPROVED");
assert.equal(approved.governed.resultReference, "demo-governed-result");

const formal = await json("/api/v1/companies/demo-company/administration", {
  headers: { cookie: first.cookie },
}, 403);
assert.equal(formal.error.code, "DEMO_IDENTITY_FORBIDDEN");

const reset = await json("/api/demo/v2/actions", {
  method: "POST",
  headers: {
    cookie: first.cookie,
    origin: browserOrigin,
    "content-type": "application/json",
  },
  body: JSON.stringify({ action: "RESET" }),
});
assert.equal(reset.generation, 2);
assert.equal(reset.governed.phase, "READY");
assert.equal(reset.commercial.renewals.length, 0);

console.log(JSON.stringify({
  status: "PASSED",
  releaseId: expectedReleaseId ?? web.headers.get("x-company-os-release-id"),
  readiness: ready.checks,
  portfolio: {
    agents: first.body.agents.length,
    work: first.body.work.length,
    classes: [...new Set(first.body.agents.map(({ agentClass }) => agentClass))].sort(),
    managementDepths: [...new Set(
      first.body.agents.map(({ managementDepth }) => managementDepth),
    )].sort(),
  },
  twoVisitorIsolation: "PASSED",
  governedPauseDecisionEvidence: "PASSED",
  renewalAndReset: "PASSED",
  formalRouteDenial: "PASSED",
}, null, 2));
