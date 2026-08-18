import type { Principal } from "../../core/control-plane.ts";
import type {
  AuthorizationIntent,
  AuthorizationReceipt,
  CompanyIdentity,
  IdentityPort,
} from "../../ports/identity-port.ts";
import {
  validateSessionClaims,
  type SessionIdentityClaims,
  type SessionValidationPolicy,
} from "./session-claims.ts";

type ClaimsProvider = () => Promise<SessionIdentityClaims | null>;
type AuthorizationProvider = (intent: AuthorizationIntent) => Promise<AuthorizationReceipt>;

export class EnterpriseOidcIdentityAdapter implements IdentityPort {
  readonly #claimsProvider: ClaimsProvider;
  readonly #authorizationProvider?: AuthorizationProvider;
  readonly #policy: SessionValidationPolicy;

  constructor(
    claimsProvider: ClaimsProvider,
    authorizationProvider: AuthorizationProvider | undefined,
    policy: SessionValidationPolicy,
  ) {
    this.#claimsProvider = claimsProvider;
    this.#authorizationProvider = authorizationProvider;
    this.#policy = policy;
  }

  async getCurrentIdentity(): Promise<CompanyIdentity | null> {
    const claims = await this.#claimsProvider();
    if (!claims) return null;
    const validated = validateSessionClaims(claims, this.#policy);
    return {
      actorId: validated.subject,
      organizationId: validated.organization,
      displayName: validated.displayName,
      assurance: "ENTERPRISE_ASSERTED",
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
      throw new Error("Enterprise authorization provider is not configured.");
    }
    return this.#authorizationProvider(intent);
  }
}
