import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import test from "node:test";

import { availablePort, waitForHttp } from "./support/company-web-edge.ts";

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 3_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}

test("the standalone public Demo runtime is ready without formal or external dependencies", async () => {
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const output: string[] = [];
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([name, value]) =>
      !name.startsWith("COMPANY_OS_") && value !== undefined),
  ) as Record<string, string>;
  const child = spawn(process.execPath, ["--experimental-strip-types", "adapters/http/service-entry.ts"], {
    cwd: process.cwd(),
    env: {
      ...inherited,
      COMPANY_OS_HOST: "127.0.0.1",
      COMPANY_OS_PORT: String(port),
      COMPANY_OS_PROFILE: "managed-cloud",
      COMPANY_OS_EXPOSURE: "public",
      COMPANY_OS_RUNTIME_MODE: "public-demo",
      COMPANY_OS_PUBLIC_DEMO_ENABLED: "true",
      COMPANY_OS_PUBLIC_URL: origin,
      COMPANY_OS_WEB_ORIGINS: "http://127.0.0.1:4173",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk) => output.push(String(chunk)));
  child.stderr?.on("data", (chunk) => output.push(String(chunk)));
  try {
    await waitForHttp(`${origin}/health`, child, output);
    const ready = await fetch(`${origin}/ready`);
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), {
      status: "ready",
      checks: {
        configuration: { status: "pass", code: "PUBLIC_DEMO_CONFIGURATION_READY" },
        connectorRuntime: { status: "pass", code: "EXTERNAL_CONNECTOR_RUNTIME_DISABLED" },
        modelRuntime: { status: "pass", code: "EXTERNAL_MODEL_RUNTIME_DISABLED" },
        secretBroker: { status: "pass", code: "SECRET_BROKER_DISABLED" },
        dataRuntime: { status: "pass", code: "DATA_RUNTIME_DISABLED" },
        database: { status: "pass", code: "FORMAL_DATABASE_DISABLED" },
      },
      service: "company-os",
      mode: "DEMO_FIXTURE",
      deploymentProfile: "managed-cloud",
    });

    const created = await fetch(`${origin}/api/demo/v2/sessions`, {
      method: "POST",
      headers: { origin: "http://127.0.0.1:4173" },
    });
    assert.equal(created.status, 201);
    const cookie = created.headers.get("set-cookie");
    assert.match(cookie ?? "", /^company-os-demo-session=/);
    const formal = await fetch(`${origin}/api/v1/companies`, {
      headers: { cookie: cookie?.split(";")[0] ?? "" },
    });
    assert.equal(formal.status, 403);
    assert.match(await formal.text(), /DEMO_IDENTITY_FORBIDDEN/);
  } finally {
    await stop(child);
  }
});
