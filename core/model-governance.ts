import type { Identifier } from "./control-plane.ts";
import type { DataClassification } from "./data-governance.ts";

export type ModelResidency = "MANAGED_CLOUD" | "LOCAL";

export interface ModelRoute {
  readonly id: Identifier;
  readonly providerAdapterId: Identifier;
  readonly modelReference: Identifier;
  readonly credentialReference: Identifier;
  readonly allowedDataClassifications: readonly DataClassification[];
  readonly residency: ModelResidency;
  readonly enabled: boolean;
}

export interface ModelRoutingPolicy {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly routes: readonly ModelRoute[];
}

export interface ModelRoutingIntent {
  readonly companyId: Identifier;
  readonly policyId: Identifier;
  readonly classification: DataClassification;
  readonly requiredResidency: ModelResidency;
}

/**
 * Immutable, secret-free authority selected for one Work Attempt. The opaque
 * credential reference is retained only so the control plane can obtain a
 * short-lived broker lease; credential material never enters this snapshot.
 */
export interface ModelExecutionAuthority {
  readonly policyId: Identifier;
  readonly routeId: Identifier;
  readonly providerAdapterId: Identifier;
  readonly modelReference: Identifier;
  readonly classification: DataClassification;
  readonly residency: ModelResidency;
  readonly credentialReferenceId: Identifier;
  readonly credentialVersion: number;
  readonly providerCapabilityDigest: string;
}

export type ModelRoutingDecision =
  | { readonly type: "SELECTED"; readonly policyId: Identifier; readonly route: ModelRoute }
  | { readonly type: "DENIED"; readonly policyCode: string };

const REFERENCE = /^[a-z0-9][a-z0-9-]{0,127}$/;

export function selectModelRoute(
  policy: ModelRoutingPolicy,
  intent: ModelRoutingIntent,
): ModelRoutingDecision {
  if (policy.companyId !== intent.companyId) {
    return { type: "DENIED", policyCode: "TENANT_MISMATCH" };
  }
  if (policy.id !== intent.policyId) {
    return { type: "DENIED", policyCode: "POLICY_MISMATCH" };
  }
  const route = policy.routes.find((candidate) =>
    candidate.enabled &&
    candidate.residency === intent.requiredResidency &&
    candidate.allowedDataClassifications.includes(intent.classification) &&
    REFERENCE.test(candidate.providerAdapterId) &&
    REFERENCE.test(candidate.modelReference) &&
    REFERENCE.test(candidate.credentialReference)
  );
  if (!route) return { type: "DENIED", policyCode: "NO_AUTHORIZED_MODEL_ROUTE" };
  return { type: "SELECTED", policyId: policy.id, route: structuredClone(route) };
}
