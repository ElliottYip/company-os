import { OWNER_DEFAULT_PERMISSION_KEYS } from "../core/company-access.ts";
import type {
  CompletedTenantSaasRegistration,
  TenantSaasCompletionStorePort,
} from "../ports/tenant-saas-completion-store-port.ts";

const PORTABLE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TENANT_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;

function id(value: string, code: string): string {
  if (!PORTABLE_ID.test(value)) throw new Error(code);
  return value;
}

export class CompleteTenantSaasRegistration {
  readonly #store: TenantSaasCompletionStorePort;
  readonly #nextId: () => string;
  readonly #now: () => string;

  constructor(input: {
    readonly store: TenantSaasCompletionStorePort;
    readonly nextId: () => string;
    readonly now: () => string;
  }) {
    this.#store = input.store;
    this.#nextId = input.nextId;
    this.#now = input.now;
  }

  async complete(input: {
    readonly registrationId: string;
    readonly verifiedUserId: string;
    readonly locale?: string;
  }): Promise<CompletedTenantSaasRegistration> {
    const completedAt = this.#now();
    const completedMilliseconds = Date.parse(completedAt);
    if (!Number.isFinite(completedMilliseconds) || new Date(completedMilliseconds).toISOString() !== completedAt) {
      throw new Error("TENANT_COMPLETION_CLOCK_INVALID");
    }
    const locale = input.locale?.trim() || "zh-CN";
    if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(locale)) throw new Error("COMPANY_LOCALE_INVALID");
    return await this.#store.complete({
      registrationId: id(input.registrationId, "TENANT_REGISTRATION_ID_INVALID"),
      verifiedUserId: id(input.verifiedUserId, "VERIFIED_HUMAN_ID_INVALID"),
      companyId: id(this.#nextId(), "TENANT_COMPANY_ID_INVALID"),
      membershipId: id(this.#nextId(), "MEMBERSHIP_ID_INVALID"),
      externalIdentityId: id(this.#nextId(), "EXTERNAL_IDENTITY_ID_INVALID"),
      eventId: id(this.#nextId(), "EVENT_ID_INVALID"),
      permissionGrants: OWNER_DEFAULT_PERMISSION_KEYS.map((permissionKey) => ({
        id: id(this.#nextId(), "PERMISSION_GRANT_ID_INVALID"),
        permissionKey,
      })),
      purpose: "AI-native company operating system",
      locale,
      completedAt,
    });
  }

  async completeBySlug(input: {
    readonly slug: string;
    readonly verifiedUserId: string;
    readonly locale?: string;
  }): Promise<CompletedTenantSaasRegistration> {
    const slug = input.slug.trim();
    if (!TENANT_SLUG.test(slug)) throw new Error("TENANT_SLUG_INVALID");
    const registrationId = await this.#store.findRegistrationIdBySlug(slug);
    if (!registrationId) throw new Error("TENANT_REGISTRATION_NOT_FOUND");
    return this.complete({
      registrationId,
      verifiedUserId: input.verifiedUserId,
      ...(input.locale ? { locale: input.locale } : {}),
    });
  }
}
