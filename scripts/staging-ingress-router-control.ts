import { spawnSync } from "node:child_process";
import { lstat } from "node:fs/promises";
import { posix, relative, resolve } from "node:path";

import { parseStagingIngressRouteContract, type StagingIngressRouteContract } from
  "../adapters/config/staging-ingress-route-contract.ts";
import type { StagingUpgradeRuntimeContract } from
  "../adapters/config/staging-upgrade-runtime-contract.ts";

type CommandResult = { readonly status: number | null; readonly stdout: string };

export async function createStagingIngressRouterControl(input: {
  readonly routeDirectory: string;
  readonly routeContract: StagingIngressRouteContract;
  readonly runtimeContract: StagingUpgradeRuntimeContract;
}, supplied: { readonly runCommand?: (argv: readonly string[]) => Promise<CommandResult> } = {}) {
  const routeDirectory = resolve(input.routeDirectory); const metadata = await lstat(routeDirectory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) {
    throw new Error("STAGING_INGRESS_ROUTER_DIRECTORY_UNSAFE");
  }
  const contract = parseStagingIngressRouteContract(input.routeContract, input.runtimeContract);
  const command = supplied.runCommand ?? defaultCommand;
  const inspect = async () => validateInspection(await command(["docker", "inspect",
    contract.router.containerId]), contract, routeDirectory);
  const execute = async (verb: "validate" | "reload", configurationFile: string) => {
    await inspect(); const containerPath = mappedPath(routeDirectory, configurationFile);
    const result = await command(["docker", "exec", contract.router.containerId, "caddy", verb,
      "--config", containerPath, "--adapter", "caddyfile"]);
    if (result.status !== 0) throw new Error(`STAGING_INGRESS_ROUTER_${verb.toUpperCase()}_FAILED`);
  };
  return {
    validateConfiguration: (path: string) => execute("validate", path),
    reloadConfiguration: (path: string) => execute("reload", path),
  };
}

function validateInspection(result: CommandResult, contract: StagingIngressRouteContract, routeDirectory: string) {
  if (result.status !== 0) invalid(); let parsed: unknown;
  try { parsed = JSON.parse(result.stdout); } catch { invalid(); }
  if (!Array.isArray(parsed) || parsed.length !== 1 || !record(parsed[0])) invalid();
  const value = parsed[0]; const config = value.Config; const state = value.State;
  const host = value.HostConfig; const networks = record(value.NetworkSettings) ? value.NetworkSettings.Networks : null;
  if (!record(config) || config.Image !== contract.router.image || !record(state) || state.Running !== true ||
      !record(host) || host.ReadonlyRootfs !== true || !Array.isArray(host.CapDrop) ||
      !host.CapDrop.includes("ALL") || !Array.isArray(host.SecurityOpt) ||
      !host.SecurityOpt.includes("no-new-privileges:true") || !Array.isArray(host.ExtraHosts) ||
      !host.ExtraHosts.includes("host.docker.internal:host-gateway") ||
      !record(networks) || !Object.hasOwn(networks, contract.router.network) ||
      !validMount(value.Mounts, routeDirectory) || !validPorts(host.PortBindings, contract)) invalid();
}
function validMount(value: unknown, routeDirectory: string) {
  return Array.isArray(value) && value.length === 1 && record(value[0]) && value[0].Type === "bind" &&
    resolve(String(value[0].Source)) === routeDirectory && value[0].Destination === "/etc/company-os-route" &&
    value[0].RW === false;
}
function validPorts(value: unknown, contract: StagingIngressRouteContract) {
  if (!record(value) || Object.keys(value).sort().join(",") !== "8080/tcp,8081/tcp") return false;
  return [["8080/tcp", contract.router.stablePorts.web], ["8081/tcp", contract.router.stablePorts.api]]
    .every(([key, port]) => { const bindings = value[String(key)]; return Array.isArray(bindings) &&
      bindings.length === 1 && record(bindings[0]) && bindings[0].HostIp === "127.0.0.1" &&
      bindings[0].HostPort === String(port); });
}
function mappedPath(routeDirectory: string, value: string) {
  const path = resolve(value); const suffix = relative(routeDirectory, path);
  if (!suffix || suffix.startsWith("..") || suffix.includes("\\") || suffix.split("/").includes("..")) {
    throw new Error("STAGING_INGRESS_ROUTER_CONFIGURATION_PATH_INVALID");
  }
  return posix.join("/etc/company-os-route", ...suffix.split("/"));
}
function defaultCommand(argv: readonly string[]): Promise<CommandResult> {
  const result = spawnSync(argv[0], argv.slice(1), { encoding: "utf8", timeout: 30_000,
    stdio: ["ignore", "pipe", "ignore"] });
  return Promise.resolve({ status: result.status, stdout: result.stdout ?? "" });
}
function record(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function invalid(): never { throw new Error("STAGING_INGRESS_ROUTER_RUNTIME_INVALID"); }
