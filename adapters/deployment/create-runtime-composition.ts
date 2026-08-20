import type { DurableControlPlaneStorePort } from "../../ports/durable-control-plane-store-port.ts";
import type { IdentityPort } from "../../ports/identity-port.ts";
import { EnterpriseOidcIdentityAdapter } from "../identity/enterprise-oidc-identity-adapter.ts";
import { RaftIdentityAdapter } from "../identity/raft-identity-adapter.ts";
import type {
  SessionIdentityClaims,
  SessionValidationPolicy,
} from "../identity/session-claims.ts";
import { LocalDurableControlPlaneStore } from "../storage/local-durable-control-plane-store.ts";
import type { AuthorizationIntent, AuthorizationReceipt } from "../../ports/identity-port.ts";

type ClaimsProvider = () => Promise<SessionIdentityClaims | null>;
type AuthorizationProvider = (intent: AuthorizationIntent) => Promise<AuthorizationReceipt>;

interface CommonOptions {
  readonly claimsProvider: ClaimsProvider;
  readonly authorizationProvider: AuthorizationProvider;
  readonly identityPolicy: SessionValidationPolicy;
}

export interface ManagedCloudCompositionOptions extends CommonOptions {
  readonly controlPlaneStore: DurableControlPlaneStorePort;
}

export interface SelfHostedCompositionOptions extends CommonOptions {
  readonly dataDirectory: string;
}

export interface RuntimeComposition {
  readonly profile: "managed-cloud" | "self-hosted";
  readonly identityKind: "raft-identity" | "enterprise-oidc";
  readonly businessCodeProfile: "shared";
  readonly identity: IdentityPort;
  readonly events: DurableControlPlaneStorePort;
  readonly controlPlaneStore: DurableControlPlaneStorePort;
}

function assertDurableStore(value: unknown): asserts value is DurableControlPlaneStorePort {
  if (!value || typeof value !== "object" ||
      !["commit", "readPendingPublications", "markPublicationDelivered",
        "loadProjectionCheckpoint", "saveProjectionCheckpoint", "exportBackup", "restoreBackup"]
        .every((method) => typeof (value as Record<string, unknown>)[method] === "function")) {
    throw new Error("Managed cloud durable control-plane store is required.");
  }
}

export function createManagedCloudComposition(
  options: ManagedCloudCompositionOptions,
): RuntimeComposition {
  assertDurableStore(options.controlPlaneStore);
  return {
    profile: "managed-cloud",
    identityKind: "raft-identity",
    businessCodeProfile: "shared",
    identity: new RaftIdentityAdapter(
      options.claimsProvider,
      options.authorizationProvider,
      options.identityPolicy,
    ),
    events: options.controlPlaneStore,
    controlPlaneStore: options.controlPlaneStore,
  };
}

export function createSelfHostedComposition(
  options: SelfHostedCompositionOptions,
): RuntimeComposition {
  if (!options.dataDirectory.trim()) throw new Error("Self-hosted data directory is required.");
  const controlPlaneStore = new LocalDurableControlPlaneStore(options.dataDirectory);
  return {
    profile: "self-hosted",
    identityKind: "enterprise-oidc",
    businessCodeProfile: "shared",
    identity: new EnterpriseOidcIdentityAdapter(
      options.claimsProvider,
      options.authorizationProvider,
      options.identityPolicy,
    ),
    events: controlPlaneStore,
    controlPlaneStore,
  };
}
