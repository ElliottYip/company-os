import { lstat, readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";

import { inspectDeploymentDrain } from "./inspect-deployment-drain.ts";

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const MAXIMUM_RECORD_BYTES = 64 * 1024;

export async function verifyDeploymentStateAdoption(
  beforePath: string,
  supplied: { readonly inspect?: typeof inspectDeploymentDrain } = {},
) {
  const before = await readBeforeRecord(beforePath);
  const after = await (supplied.inspect ?? inspectDeploymentDrain)();
  const findings: string[] = [];
  if (before.status !== "DRAINED" || before.restartAllowed !== true) {
    findings.push("PRE_RESTART_STATE_NOT_DRAINED");
  }
  if (after.status !== "DRAINED" || after.restartAllowed !== true) {
    findings.push("POST_RESTART_STATE_NOT_DRAINED");
  }
  if (before.exactSourceDigest !== after.exactSourceDigest) {
    findings.push("DURABLE_STATE_DIGEST_CHANGED");
  }
  if (JSON.stringify(before.snapshot) !== JSON.stringify(after.snapshot)) {
    findings.push("DURABLE_STATE_SUMMARY_CHANGED");
  }
  return {
    schemaVersion: 1,
    status: findings.length ? "ADOPTION_FAILED_REQUIRES_REVIEW" : "ADOPTION_VERIFIED",
    stateAdopted: findings.length === 0,
    findings,
    before: { observedAt: before.observedAt, exactSourceDigest: before.exactSourceDigest },
    after: { observedAt: after.observedAt, exactSourceDigest: after.exactSourceDigest },
  } as const;
}

async function readBeforeRecord(path: string) {
  if (!isAbsolute(path)) throw new Error("ADOPTION_BEFORE_PATH_ABSOLUTE_REQUIRED");
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      (metadata.mode & 0o077) !== 0 || metadata.size < 2 || metadata.size > MAXIMUM_RECORD_BYTES) {
    throw new Error("ADOPTION_BEFORE_RECORD_UNSAFE");
  }
  let value: unknown;
  try { value = JSON.parse(await readFile(path, "utf8")); }
  catch { throw new Error("ADOPTION_BEFORE_RECORD_INVALID"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ADOPTION_BEFORE_RECORD_INVALID");
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1 || typeof record.status !== "string" ||
      typeof record.restartAllowed !== "boolean" || typeof record.observedAt !== "string" ||
      !Number.isFinite(Date.parse(record.observedAt)) ||
      typeof record.exactSourceDigest !== "string" || !DIGEST.test(record.exactSourceDigest) ||
      !validSnapshot(record.snapshot)) throw new Error("ADOPTION_BEFORE_RECORD_INVALID");
  return record as unknown as {
    readonly schemaVersion: 1;
    readonly status: string;
    readonly restartAllowed: boolean;
    readonly observedAt: string;
    readonly exactSourceDigest: string;
    readonly snapshot: Record<string, number>;
  };
}

function validSnapshot(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length === 8 && entries.every(([, item]) =>
    Number.isSafeInteger(item) && (item as number) >= 0);
}

function beforePathFromArguments(values: readonly string[]): string {
  if (values.length !== 2 || values[0] !== "--before" || !values[1]) {
    throw new Error("ADOPTION_ARGUMENTS_INVALID");
  }
  return values[1];
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const result = await verifyDeploymentStateAdoption(beforePathFromArguments(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.stateAdopted) process.exitCode = 2;
}
