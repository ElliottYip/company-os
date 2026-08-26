import { decideCompanyAccess, type CompanyMembership } from "../../core/company-access.ts";
import { OWNER_DEFAULT_PERMISSION_KEYS } from "../../core/company-access.ts";
import type { Identifier, Principal } from "../../core/control-plane.ts";
import type {
  AuthorizationIntent,
  AuthorizationReceipt,
  CompanyIdentity,
  IdentityPort,
} from "../../ports/identity-port.ts";

export class SessionCompanyIdentityAdapter implements IdentityPort {
  readonly #user: { readonly id: Identifier; readonly displayName: string };
  readonly #companyId: Identifier;
  readonly #memberships: readonly CompanyMembership[];
  readonly #now: () => string;
  readonly #nextId: () => Identifier;
  readonly #permissionKeys: ReadonlySet<string>;
  readonly #isInstanceAdmin: boolean;

  constructor(input: {
    readonly user: { readonly id: Identifier; readonly displayName: string };
    readonly companyId: Identifier;
    readonly memberships: readonly CompanyMembership[];
    readonly now: () => string;
    readonly nextId: () => Identifier;
    readonly permissionKeys?: readonly string[];
    readonly isInstanceAdmin?: boolean;
  }) {
    this.#user = input.user;
    this.#companyId = input.companyId;
    this.#memberships = structuredClone(input.memberships);
    this.#now = input.now;
    this.#nextId = input.nextId;
    this.#isInstanceAdmin = input.isInstanceAdmin ?? false;
    const owner = input.memberships.some((membership) =>
      membership.companyId === input.companyId && membership.principalId === input.user.id &&
      membership.status === "active" && membership.role === "owner");
    this.#permissionKeys = new Set(input.permissionKeys ?? (owner ? OWNER_DEFAULT_PERMISSION_KEYS : []));
  }

  async getCurrentIdentity(): Promise<CompanyIdentity | null> {
    const access = decideCompanyAccess({
      type: "user", principalId: this.#user.id, memberships: this.#memberships,
    }, this.#companyId, "read");
    if (!access.allowed) return null;
    return {
      actorId: this.#user.id,
      organizationId: this.#companyId,
      displayName: this.#user.displayName,
      assurance: "ENTERPRISE_ASSERTED",
    };
  }

  async currentPrincipal(): Promise<Principal | null> {
    return await this.getCurrentIdentity()
      ? { id: this.#user.id, kind: "HUMAN", displayName: this.#user.displayName }
      : null;
  }

  async authorize(intent: AuthorizationIntent): Promise<AuthorizationReceipt> {
    if (intent.companyId !== this.#companyId) throw new Error("TENANT_MISMATCH");
    const operation = intent.action.endsWith(":read") ? "read" : "write";
    const decision = decideCompanyAccess({
      type: "user", principalId: this.#user.id, memberships: this.#memberships,
    }, this.#companyId, operation);
    if (!decision.allowed) throw new Error(decision.code);
    const requiredPermission = this.#isInstanceAdmin ? null : requiredPermissionForAction(intent.action);
    if (requiredPermission && !this.#permissionKeys.has(requiredPermission)) {
      throw new Error("COMPANY_PERMISSION_REQUIRED");
    }
    return {
      id: this.#nextId(),
      principalId: this.#user.id,
      authorizedAt: this.#now(),
    };
  }
}

function requiredPermissionForAction(action: string): string | null {
  if (action.endsWith(":read") || action.startsWith("approval:")) return null;
  if (action === "work:dispatch") return "tasks:assign";
  if (action === "responsibility:replace") return "agents:configure";
  if (action === "responsibility:transfer") return "agents:configure";
  if (action === "agent:approve") return "joins:approve";
  if (action === "agent:lifecycle") return "agents:configure";
  if (action === "connector-catalog:replace") return "tools:admin";
  if (action.startsWith("company-portability:")) return "users:manage_permissions";
  if (action === "secret:lease") return "tools:use";
  if (action.startsWith("secret:reference:")) return "tools:admin";
  if (action === "organization:register" || action.startsWith("fde-template:")) {
    return "users:manage_permissions";
  }
  if (action === "governance-catalog:replace" || action === "data-egress:evaluate") {
    return "tools:admin";
  }
  return "users:manage_permissions";
}
