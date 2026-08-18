import type { Principal } from "../../core/control-plane.ts";
import type {
  AuthorizationIntent,
  AuthorizationReceipt,
  CompanyIdentity,
  IdentityPort,
} from "../../ports/identity-port.ts";

interface RaftIdentityClaims {
  readonly subject?: unknown;
  readonly organization?: unknown;
  readonly displayName?: unknown;
}

type ClaimsProvider = () => Promise<RaftIdentityClaims | null>;
type AuthorizationProvider = (
  intent: AuthorizationIntent,
) => Promise<AuthorizationReceipt>;

export class RaftIdentityAdapter implements IdentityPort {
  readonly #claimsProvider: ClaimsProvider;
  readonly #authorizationProvider?: AuthorizationProvider;

  constructor(
    claimsProvider: ClaimsProvider,
    authorizationProvider?: AuthorizationProvider,
  ) {
    this.#claimsProvider = claimsProvider;
    this.#authorizationProvider = authorizationProvider;
  }

  async getCurrentIdentity(): Promise<CompanyIdentity | null> {
    const claims = await this.#claimsProvider();
    if (claims === null) return null;
    if (
      typeof claims.subject !== "string" || !claims.subject ||
      typeof claims.organization !== "string" || !claims.organization ||
      typeof claims.displayName !== "string" || !claims.displayName
    ) {
      throw new Error("Invalid Raft identity claims at adapter boundary.");
    }
    return {
      actorId: claims.subject,
      organizationId: claims.organization,
      displayName: claims.displayName,
      assurance: "HOST_ASSERTED",
    };
  }

  async currentPrincipal(): Promise<Principal | null> {
    const identity = await this.getCurrentIdentity();
    return identity
      ? { id: identity.actorId, kind: "HUMAN", displayName: identity.displayName }
      : null;
  }

  async authorize(intent: AuthorizationIntent): Promise<AuthorizationReceipt> {
    if (!this.#authorizationProvider) {
      throw new Error("Raft authorization provider is not configured.");
    }
    return this.#authorizationProvider(intent);
  }
}

