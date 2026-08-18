import { createDemoComposition } from "../demo/create-demo-composition.ts";
import { createCompanyOsHttpService } from "./company-os-http-service.ts";

function deploymentProfile(value: string | undefined): "managed-cloud" | "self-hosted" {
  if (value === undefined || value === "self-hosted") return "self-hosted";
  if (value === "managed-cloud") return value;
  throw new Error("COMPANY_OS_PROFILE must be managed-cloud or self-hosted");
}

function port(value: string | undefined) {
  const parsed = value === undefined ? 4310 : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("COMPANY_OS_PORT must be an integer from 1 to 65535");
  }
  return parsed;
}

const profile = deploymentProfile(process.env.COMPANY_OS_PROFILE);
const host = process.env.COMPANY_OS_HOST?.trim() || "127.0.0.1";
const listenPort = port(process.env.COMPANY_OS_PORT);
const { runtime } = createDemoComposition();
const server = createCompanyOsHttpService({ runtime, deploymentProfile: profile });

server.listen(listenPort, host, () => {
  process.stdout.write(JSON.stringify({
    event: "company_os.started",
    host,
    port: listenPort,
    profile,
    mode: "DEMO_FIXTURE",
  }) + "\n");
});

function shutdown(signal: string) {
  server.close(() => {
    process.stdout.write(JSON.stringify({ event: "company_os.stopped", signal }) + "\n");
    process.exitCode = 0;
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
