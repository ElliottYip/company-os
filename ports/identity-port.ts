import type { Identifier, Principal } from "../core/control-plane.ts";

export interface CompanyIdentity {
  readonly actorId: Identifier;
  readonly organizationId: Identifier;
  readonly displayName: string;
  readonly assurance: "HOST_ASSERTED" | "ENTERPRISE_ASSERTED" | "LOCAL_DEMO";
}

export interface AuthorizationIntent {
  readonly companyId: Identifier;
  readonly action: string;
  readonly resourceId?: Identifier;
  readonly reason: string;
}

export interface AuthorizationReceipt {
  readonly id: Identifier;
  readonly principalId: Identifier;
  readonly authorizedAt: string;
  readonly expiresAt?: string;
}

export interface IdentityPort {
  getCurrentIdentity(): Promise<CompanyIdentity | null>;
  currentPrincipal(): Promise<Principal | null>;
  authorize(intent: AuthorizationIntent): Promise<AuthorizationReceipt>;
}

