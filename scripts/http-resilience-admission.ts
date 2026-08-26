import { once } from "node:events";
import { pathToFileURL } from "node:url";
import { createDemoComposition } from "../adapters/demo/create-demo-composition.ts";
import { createCompanyOsHttpService } from "../adapters/http/company-os-http-service.ts";

export interface HttpResilienceAdmissionOptions {
  readonly concurrency: number;
  readonly healthyRequests: number;
  readonly abusiveRequests: number;
  readonly maximumP95Milliseconds: number;
  readonly minimumDurationMilliseconds?: number;
}

export interface HttpResilienceAdmissionResult {
  readonly schemaVersion: 1;
  readonly status: "PASS";
  readonly healthyRequests: number;
  readonly abusiveRequests: number;
  readonly recovered: true;
  readonly secretLeakage: false;
  readonly availabilityFailures: 0;
  readonly p95WithinBudget: true;
}

function boundedInteger(value: number, minimum: number, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(code);
  return value;
}

function validateOptions(options: HttpResilienceAdmissionOptions): HttpResilienceAdmissionOptions {
  return {
    concurrency: boundedInteger(options.concurrency, 1, 256, "HTTP_RESILIENCE_CONCURRENCY_INVALID"),
    healthyRequests: boundedInteger(options.healthyRequests, 1, 100_000, "HTTP_RESILIENCE_HEALTHY_REQUESTS_INVALID"),
    abusiveRequests: boundedInteger(options.abusiveRequests, 3, 10_000, "HTTP_RESILIENCE_ABUSIVE_REQUESTS_INVALID"),
    maximumP95Milliseconds: boundedInteger(
      options.maximumP95Milliseconds,
      50,
      60_000,
      "HTTP_RESILIENCE_P95_BUDGET_INVALID",
    ),
    minimumDurationMilliseconds: boundedInteger(
      options.minimumDurationMilliseconds ?? 0,
      0,
      300_000,
      "HTTP_RESILIENCE_DURATION_INVALID",
    ),
  };
}

async function parallelMap(count: number, concurrency: number, worker: (index: number) => Promise<void>) {
  let nextIndex = 0;
  async function consume() {
    while (nextIndex < count) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(count, concurrency) }, () => consume()));
}

function percentile95(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)] ?? Number.POSITIVE_INFINITY;
}

export async function runHttpResilienceAdmission(
  input: HttpResilienceAdmissionOptions,
): Promise<HttpResilienceAdmissionResult> {
  const options = validateOptions(input);
  const secretMarker = "synthetic-never-return-this-secret";
  const { runtime } = createDemoComposition();
  let dependencyStatus: "ready" | "not_ready" = "ready";
  let dependencyCode = "DATABASE_READY";
  const server = createCompanyOsHttpService({
    runtime,
    deploymentProfile: "self-hosted",
    serviceMode: "LOCAL_DEVELOPMENT",
    deploymentExposure: "private",
    allowedOrigins: ["http://admission.test"],
    maxBodyBytes: 1_024,
    metricsEnabled: true,
    operationalReadiness: {
      async getStatus() {
        return {
          status: dependencyStatus,
          checks: { database: {
            status: dependencyStatus === "ready" ? "pass" as const : "fail" as const,
            code: dependencyCode,
          } },
        };
      },
    },
    formalDirectory: {
      async listCompanies() {
        throw new Error(secretMarker);
      },
    },
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("HTTP_RESILIENCE_LISTENER_MISSING");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const admissionStartedAt = performance.now();
  const latencies: number[] = [];
  let availabilityFailures = 0;
  let secretLeakage = false;

  try {
    await parallelMap(options.healthyRequests, options.concurrency, async () => {
      const startedAt = performance.now();
      const response = await fetch(`${baseUrl}/health`);
      const body = await response.text();
      latencies.push(performance.now() - startedAt);
      if (response.status !== 200 || !body.includes('"status":"ok"')) availabilityFailures += 1;
      if (body.includes(secretMarker)) secretLeakage = true;
    });

    await parallelMap(options.abusiveRequests, options.concurrency, async (index) => {
      let response: Response;
      if (index % 3 === 0) {
        response = await fetch(`${baseUrl}/api/demo/actions`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://admission.test" },
          body: `{"marker":"${secretMarker}"`,
        });
        if (response.status !== 400) availabilityFailures += 1;
      } else if (index % 3 === 1) {
        response = await fetch(`${baseUrl}/api/demo/actions`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://admission.test" },
          body: JSON.stringify({ marker: secretMarker, padding: "x".repeat(2_048) }),
        });
        if (response.status !== 413) availabilityFailures += 1;
      } else {
        response = await fetch(`${baseUrl}/api/v1/companies`);
        if (response.status !== 409) availabilityFailures += 1;
      }
      if ((await response.text()).includes(secretMarker)) secretLeakage = true;
    });

    let soakBatch = 0;
    while (performance.now() - admissionStartedAt < (options.minimumDurationMilliseconds ?? 0)) {
      await parallelMap(options.concurrency, options.concurrency, async () => {
        const startedAt = performance.now();
        const response = await fetch(`${baseUrl}/health`);
        const body = await response.text();
        latencies.push(performance.now() - startedAt);
        if (response.status !== 200 || !body.includes('\"status\":\"ok\"')) availabilityFailures += 1;
        if (body.includes(secretMarker)) secretLeakage = true;
      });
      if (soakBatch % 5 === 0) {
        const malformed = await fetch(`${baseUrl}/api/demo/actions`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://admission.test" },
          body: `{"marker":"${secretMarker}"`,
        });
        const body = await malformed.text();
        if (malformed.status !== 400) availabilityFailures += 1;
        if (body.includes(secretMarker)) secretLeakage = true;
      }
      soakBatch += 1;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    dependencyStatus = "not_ready";
    dependencyCode = "DATABASE_UNAVAILABLE";
    const degraded = await fetch(`${baseUrl}/ready`);
    if (degraded.status !== 503) availabilityFailures += 1;

    dependencyStatus = "ready";
    dependencyCode = "DATABASE_READY";
    const recovered = await fetch(`${baseUrl}/ready`);
    const recoveredBody = await recovered.text();
    if (recovered.status !== 200 || !recoveredBody.includes('"status":"ready"')) availabilityFailures += 1;

    const metrics = await (await fetch(`${baseUrl}/metrics`)).text();
    if (metrics.includes(secretMarker)) secretLeakage = true;

    const p95WithinBudget = percentile95(latencies) <= options.maximumP95Milliseconds;
    if (availabilityFailures !== 0) throw new Error("HTTP_RESILIENCE_AVAILABILITY_FAILED");
    if (secretLeakage) throw new Error("HTTP_RESILIENCE_SECRET_LEAKAGE");
    if (!p95WithinBudget) throw new Error("HTTP_RESILIENCE_P95_BUDGET_EXCEEDED");

    return {
      schemaVersion: 1,
      status: "PASS",
      healthyRequests: options.healthyRequests,
      abusiveRequests: options.abusiveRequests,
      recovered: true,
      secretLeakage: false,
      availabilityFailures: 0,
      p95WithinBudget: true,
    };
  } finally {
    server.close();
    server.closeAllConnections();
    await once(server, "close");
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  runHttpResilienceAdmission({
    concurrency: 64,
    healthyRequests: 1_500,
    abusiveRequests: 300,
    maximumP95Milliseconds: 1_500,
  }).then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error: unknown) => {
    const code = error instanceof Error && /^HTTP_RESILIENCE_[A-Z_]+$/.test(error.message)
      ? error.message
      : "HTTP_RESILIENCE_ADMISSION_FAILED";
    process.stderr.write(`${JSON.stringify({ schemaVersion: 1, status: "FAIL", code })}\n`);
    process.exitCode = 1;
  });
}
