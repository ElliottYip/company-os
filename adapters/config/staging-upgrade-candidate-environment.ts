import { isAbsolute, resolve } from "node:path";

import { parsePublicStagingEnvironment } from "./staging-deployment-doctor.ts";
import { parseStagingUpgradeRuntimeContract } from "./staging-upgrade-runtime-contract.ts";

const INHERITED_KEYS = ["COMPANY_OS_PUBLIC_URL", "COMPANY_OS_WEB_ORIGINS",
  "COMPANY_OS_OIDC_REDIRECT_URI", "COMPANY_OS_INSTANCE_ID", "COMPANY_OS_OIDC_ISSUER",
  "COMPANY_OS_OIDC_DISCOVERY_URL", "COMPANY_OS_OIDC_CLIENT_ID",
  "COMPANY_OS_TRUSTED_PROXY_CIDRS", "COMPANY_OS_RETENTION_POLICY_ID",
  "COMPANY_OS_ACCOUNTABILITY_EXPORT_POLICY_ID", "COMPANY_OS_HTTP_DATA_NODE_SOURCES",
  "COMPANY_OS_HTTP_DATA_NODE_OPERATIONS"] as const;

export function renderStagingUpgradeCandidateEnvironment(
  contractValue: unknown,
  activeEnvironmentSource: string,
  secretProjectionDirectory: string,
): string {
  const contract = parseStagingUpgradeRuntimeContract(contractValue);
  const active = parsePublicStagingEnvironment(activeEnvironmentSource);
  const secretDirectory = safeDirectory(secretProjectionDirectory);
  assertActiveTopology(active, contract.active);
  if (contract.candidate.resourceBudget.maximumMemoryBytes < 1_073_741_824 ||
      contract.candidate.resourceBudget.maximumCpu < 1 ||
      contract.candidate.resourceBudget.maximumPids < 256 ||
      contract.candidate.resourceBudget.requiredHostHeadroomBytes < 536_870_912) {
    throw new Error("STAGING_UPGRADE_CANDIDATE_RESOURCE_BUDGET_INSUFFICIENT");
  }
  const inherited = Object.fromEntries(INHERITED_KEYS.map((key) => {
    const value = active[key];
    if (!value) throw new Error(`STAGING_UPGRADE_ACTIVE_ENVIRONMENT_MISSING:${key}`);
    return [key, value];
  }));
  const candidate = contract.candidate;
  const values: Record<string, string> = {
    COMPANY_OS_API_IMAGE: candidate.images.api,
    COMPANY_OS_WEB_IMAGE: candidate.images.web,
    COMPANY_OS_OPS_IMAGE: candidate.images.ops,
    COMPANY_OS_CODEX_AGENT_NODE_IMAGE: candidate.images.codexAgentNode,
    COMPANY_OS_VAULT_SECRET_BROKER_IMAGE: candidate.images.vaultSecretBroker,
    COMPANY_OS_REFERENCE_DATA_NODE_IMAGE: candidate.images.referenceDataNode,
    COMPANY_OS_COMPOSE_PROJECT: candidate.composeProject,
    COMPANY_OS_PRODUCT_NETWORK: candidate.productNetwork,
    COMPANY_OS_REFERENCE_DATA_NODE_PORT: String(candidate.ports.referenceDataNode),
    COMPANY_OS_WEB_LOOPBACK_PORT: String(candidate.ports.web),
    COMPANY_OS_API_LOOPBACK_PORT: String(candidate.ports.api),
    COMPANY_OS_DATA_NODE_VOLUME: `${candidate.composeProject}-data-node`,
    COMPANY_OS_BACKUP_VOLUME: `${candidate.composeProject}-backups`,
    ...inherited,
    COMPANY_OS_HTTP_AGENT_NODE_ID: candidate.serviceIds.agentNode,
    COMPANY_OS_HTTP_AGENT_NODE_NAME: `Candidate Agent Node ${contract.operationId}`,
    COMPANY_OS_HTTP_AGENT_NODE_BASE_URL: `https://${candidate.serviceIds.agentNode}`,
    COMPANY_OS_HTTP_DATA_NODE_ID: candidate.serviceIds.dataNode,
    COMPANY_OS_HTTP_DATA_NODE_NAME: `Candidate Data Node ${contract.operationId}`,
    COMPANY_OS_HTTP_DATA_NODE_BASE_URL: `https://${candidate.serviceIds.dataNode}`,
    COMPANY_OS_HTTP_SECRET_BROKER_ID: candidate.serviceIds.secretBroker,
    COMPANY_OS_HTTP_SECRET_BROKER_NAME: `Candidate Secret Broker ${contract.operationId}`,
    COMPANY_OS_HTTP_SECRET_BROKER_BASE_URL: `https://${candidate.serviceIds.secretBroker}`,
    COMPANY_OS_PUBLIC_INGRESS: "DISABLED_PRE_CUTOVER",
    COMPANY_OS_OFF_SITE_BACKUP: "DISABLED_PENDING_AUTHORIZATION",
    COMPANY_OS_SECRET_DIRECTORY: secretDirectory,
  };
  return `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n")}\n`;
}

function assertActiveTopology(environment: Record<string, string>, active: {
  readonly composeProject: string;
  readonly productNetwork: string;
  readonly ports: { readonly api: number; readonly web: number; readonly referenceDataNode: number };
}) {
  const expected: Record<string, string> = {
    COMPANY_OS_COMPOSE_PROJECT: active.composeProject,
    COMPANY_OS_PRODUCT_NETWORK: active.productNetwork,
    COMPANY_OS_API_LOOPBACK_PORT: String(active.ports.api),
    COMPANY_OS_WEB_LOOPBACK_PORT: String(active.ports.web),
    COMPANY_OS_REFERENCE_DATA_NODE_PORT: String(active.ports.referenceDataNode),
  };
  if (Object.entries(expected).some(([key, value]) => environment[key] !== value)) {
    throw new Error("STAGING_UPGRADE_ACTIVE_ENVIRONMENT_MISMATCH");
  }
}

function safeDirectory(value: string): string {
  if (!isAbsolute(value)) throw new Error("STAGING_UPGRADE_SECRET_PROJECTION_PATH_INVALID");
  const normalized = resolve(value);
  if (normalized === "/") throw new Error("STAGING_UPGRADE_SECRET_PROJECTION_PATH_INVALID");
  return normalized;
}
