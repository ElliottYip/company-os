import { parseStagingDependencyManifest } from "./staging-dependency-manifest.ts";
import { parseStagingUpgradeRuntimeContract } from "./staging-upgrade-runtime-contract.ts";

export function renderStagingUpgradeCandidateDependencies(contractValue: unknown,
  activeManifestSource: string) {
  const contract = parseStagingUpgradeRuntimeContract(contractValue);
  let source: unknown; try { source = JSON.parse(activeManifestSource); }
  catch { throw new Error("STAGING_UPGRADE_DEPENDENCY_MANIFEST_INVALID"); }
  const active = parseStagingDependencyManifest(source);
  if (active.isolation.composeProject !== contract.active.composeProject ||
      active.isolation.network !== contract.active.productNetwork ||
      active.isolation.apiLoopbackPort !== contract.active.ports.api ||
      active.isolation.webLoopbackPort !== contract.active.ports.web) {
    throw new Error("STAGING_UPGRADE_DEPENDENCY_ACTIVE_TOPOLOGY_MISMATCH");
  }
  const candidate = { ...active, isolation: { ...active.isolation,
    composeProject: contract.candidate.composeProject,
    network: contract.candidate.productNetwork,
    apiLoopbackPort: contract.candidate.ports.api,
    webLoopbackPort: contract.candidate.ports.web } };
  const parsed = parseStagingDependencyManifest(candidate);
  return `${JSON.stringify(parsed, null, 2)}\n`;
}
