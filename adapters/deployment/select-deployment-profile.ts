export type DeploymentProfileName = "managed-cloud" | "self-hosted";

export interface DeploymentProfile {
  readonly name: DeploymentProfileName;
  readonly identityAdapter: "raft-identity" | "local-oidc";
  readonly eventStoreAdapter: "cloud-event-store" | "local-event-store";
  readonly executionPlane: "hybrid" | "local";
  readonly businessCodeProfile: "shared";
}

const profiles: Record<DeploymentProfileName, DeploymentProfile> = {
  "managed-cloud": {
    name: "managed-cloud",
    identityAdapter: "raft-identity",
    eventStoreAdapter: "cloud-event-store",
    executionPlane: "hybrid",
    businessCodeProfile: "shared",
  },
  "self-hosted": {
    name: "self-hosted",
    identityAdapter: "local-oidc",
    eventStoreAdapter: "local-event-store",
    executionPlane: "local",
    businessCodeProfile: "shared",
  },
};

export function selectDeploymentProfile(name: DeploymentProfileName): DeploymentProfile {
  return profiles[name];
}

