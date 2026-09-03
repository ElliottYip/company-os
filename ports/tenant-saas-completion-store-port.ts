export interface CompleteTenantSaasRegistrationCommand {
  readonly registrationId: string;
  readonly verifiedUserId: string;
  readonly companyId: string;
  readonly membershipId: string;
  readonly externalIdentityId: string;
  readonly eventId: string;
  readonly permissionGrants: readonly {
    readonly id: string;
    readonly permissionKey: string;
  }[];
  readonly purpose: string;
  readonly locale: string;
  readonly completedAt: string;
}

export interface CompletedTenantSaasRegistration {
  readonly status: "COMPLETED" | "ALREADY_COMPLETED";
  readonly registrationId: string;
  readonly companyId: string;
  readonly ownerUserId: string;
  readonly slug: string;
}

export interface TenantSaasCompletionStorePort {
  findRegistrationIdBySlug(slug: string): Promise<string | null>;
  complete(command: CompleteTenantSaasRegistrationCommand): Promise<CompletedTenantSaasRegistration>;
}
