import type { EventDataStorePort } from "../../ports/event-data-store-port.ts";
import type { IdentityPort } from "../../ports/identity-port.ts";
import { EnterpriseOidcIdentityAdapter } from "../identity/enterprise-oidc-identity-adapter.ts";
import { RaftIdentityAdapter } from "../identity/raft-identity-adapter.ts";
import type {
  SessionIdentityClaims,
  SessionValidationPolicy,
} from "../identity/session-claims.ts";
import { LocalEventStore } from "../storage/local-event-store.ts";
import type { AuthorizationIntent, AuthorizationReceipt } from "../../ports/identity-port.ts";

type ClaimsProvider = () => Promise<SessionIdentityClaims | null>;
type AuthorizationProvider = (intent: AuthorizationIntent) => Promise<AuthorizationReceipt>;

interface CommonOptions {
  readonly claimsProvider: ClaimsProvider;
  readonly authorizationProvider: AuthorizationProvider;
  readonly identityPolicy: SessionValidationPolicy;
}

export interface ManagedCloudCompositionOptions extends CommonOptions {
  readonly eventStore: EventDataStorePort;
}

export interface SelfHostedCompositionOptions extends CommonOptions {
  readonly dataDirectory: string;
}

export interface RuntimeComposition {
  readonly profile: "managed-cloud" | "self-hosted";
  readonly identityKind: "raft-identity" | "enterprise-oidc";
  readonly businessCodeProfile: "shared";
  readonly identity: IdentityPort;
  readonly events: EventDataStorePort;
}

export function createManagedCloudComposition(
  options: ManagedCloudCompositionOptions,
): RuntimeComposition {
  if (!options.eventStore) throw new Error("Managed cloud event store is required.");
  return {
    profile: "managed-cloud",
    identityKind: "raft-identity",
    businessCodeProfile: "shared",
    identity: new RaftIdentityAdapter(
      options.claimsProvider,
      options.authorizationProvider,
      options.identityPolicy,
    ),
    events: options.eventStore,
  };
}

export function createSelfHostedComposition(
  options: SelfHostedCompositionOptions,
): RuntimeComposition {
  if (!options.dataDirectory.trim()) throw new Error("Self-hosted data directory is required.");
  return {
    profile: "self-hosted",
    identityKind: "enterprise-oidc",
    businessCodeProfile: "shared",
    identity: new EnterpriseOidcIdentityAdapter(
      options.claimsProvider,
      options.authorizationProvider,
      options.identityPolicy,
    ),
    events: new LocalEventStore(options.dataDirectory),
  };
}
