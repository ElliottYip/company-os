import { spawnSync } from "node:child_process";
import { lstat, readFile, readdir, stat, statfs } from "node:fs/promises";
import { connect } from "node:net";
import { cpus, totalmem } from "node:os";

import {
  evaluateStagingDeploymentReadiness,
  parsePublicStagingEnvironment,
  type StagingDeploymentSnapshot,
} from "../adapters/config/staging-deployment-doctor.ts";

const defaults = { root: "/srv/company-os/staging", secretDirectory: "/etc/company-os/secrets",
  environmentFile: "/srv/company-os/staging/staging.env" };

async function main() {
  const options = argumentsFrom(process.argv.slice(2));
  const [root, secretDirectory, runtime, target, publicEnvironment] = await Promise.all([
    directory(options.root), secretFiles(options.secretDirectory), hostRuntime(), targetState(),
    publicEnvironmentFrom(options.environmentFile),
  ]);
  const snapshot: StagingDeploymentSnapshot = { root: { path: options.root, ...root },
    secretDirectory: { path: options.secretDirectory, ...secretDirectory }, runtime, target, publicEnvironment };
  const result = evaluateStagingDeploymentReadiness(snapshot);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.status === "READY" ? 0 : 2;
}

function argumentsFrom(values: readonly string[]) {
  const result = { ...defaults };
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index]; const value = values[index + 1];
    if (!value || !value.startsWith("/")) throw new Error("STAGING_DOCTOR_ABSOLUTE_PATH_REQUIRED");
    if (flag === "--root") result.root = value;
    else if (flag === "--secret-directory") result.secretDirectory = value;
    else if (flag === "--env-file") result.environmentFile = value;
    else throw new Error("STAGING_DOCTOR_ARGUMENT_INVALID");
  }
  return result;
}

async function directory(path: string): Promise<{ exists: boolean; mode: number | null }> {
  try {
    const value = await stat(path);
    return { exists: value.isDirectory(), mode: value.mode & 0o777 };
  } catch (error) {
    if (isMissing(error)) return { exists: false, mode: null };
    throw error;
  }
}

async function secretFiles(path: string): Promise<StagingDeploymentSnapshot["secretDirectory"]> {
  const base = await directory(path);
  if (!base.exists) return { path, ...base, files: [] };
  const files = await Promise.all((await readdir(path)).map(async (name) => {
    const value = await lstat(`${path}/${name}`);
    return { name, kind: value.isSymbolicLink() ? "symlink" as const : value.isFile() ? "file" as const : "other" as const,
      mode: value.mode & 0o777, size: value.size };
  }));
  return { path, ...base, files };
}

async function publicEnvironmentFrom(path: string): Promise<Record<string, string>> {
  try { return parsePublicStagingEnvironment(await readFile(path, "utf8")); }
  catch (error) {
    if (isMissing(error)) return {};
    throw error;
  }
}

async function hostRuntime(): Promise<StagingDeploymentSnapshot["runtime"]> {
  const disk = await statfs("/");
  return { dockerAvailable: command(["docker", "version", "--format", "{{.Server.Version}}"]),
    composeAvailable: command(["docker", "compose", "version", "--short"]), cpuCount: cpus().length,
    totalMemoryBytes: totalmem(), freeDiskBytes: Number(disk.bavail * disk.bsize) };
}

async function targetState(): Promise<StagingDeploymentSnapshot["target"]> {
  const composeProjectExists = command(["docker", "ps", "-a", "--filter",
    "label=com.docker.compose.project=company-os-staging", "--quiet"], true);
  const targetNetworkExists = command(["docker", "network", "inspect", "company-os-staging_internal"], true);
  return { composeProjectExists, targetNetworkExists,
    loopbackPorts: await Promise.all(([4600, 4601] as const).map(async (port) => ({ port,
      status: await portStatus(port) }))) };
}

function command(argv: readonly string[], requireOutput = false): boolean {
  const result = spawnSync(argv[0] as string, argv.slice(1), { encoding: "utf8", timeout: 5_000,
    stdio: ["ignore", "pipe", "ignore"] });
  return result.status === 0 && (!requireOutput || Boolean(result.stdout.trim()));
}

function portStatus(port: 4600 | 4601): Promise<"FREE" | "OCCUPIED" | "UNKNOWN"> {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    const done = (value: "FREE" | "OCCUPIED" | "UNKNOWN") => { socket.destroy(); resolve(value); };
    socket.setTimeout(300, () => done("UNKNOWN"));
    socket.once("connect", () => done("OCCUPIED"));
    socket.once("error", (error: NodeJS.ErrnoException) => done(error.code === "ECONNREFUSED" ? "FREE" : "UNKNOWN"));
  });
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

await main();
