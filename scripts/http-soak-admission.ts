import { runHttpResilienceAdmission } from "./http-resilience-admission.ts";

const minimumDurationMilliseconds = 30_000;
const startedAt = performance.now();

runHttpResilienceAdmission({
  concurrency: 8,
  healthyRequests: 100,
  abusiveRequests: 12,
  maximumP95Milliseconds: 1_500,
  minimumDurationMilliseconds: 30_000,
}).then((result) => {
  const durationMilliseconds = Math.floor(performance.now() - startedAt);
  if (durationMilliseconds < minimumDurationMilliseconds) throw new Error("HTTP_SOAK_DURATION_NOT_MET");
  process.stdout.write(`${JSON.stringify({ ...result, durationMilliseconds, sameProcess: true })}\n`);
}).catch((error: unknown) => {
  const code = error instanceof Error && /^(?:HTTP_RESILIENCE|HTTP_SOAK)_[A-Z_]+$/.test(error.message)
    ? error.message : "HTTP_SOAK_ADMISSION_FAILED";
  process.stderr.write(`${JSON.stringify({ schemaVersion: 1, status: "FAIL", code })}\n`);
  process.exitCode = 1;
});
