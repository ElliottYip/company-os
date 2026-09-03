import type { TenantRegistrationRecord } from "../core/tenant-registration.ts";
import type { EncryptedTenantSecret } from "./tenant-secret-store-port.ts";

export interface ActiveLegacyTenantBinding {
  readonly id: string;
  readonly registrationId: string;
  readonly companyId: string;
  readonly providerFamily: "OAUTH2";
  readonly providerKey: "feishu";
  readonly publicProviderId: string;
  readonly externalTenantDigest: `sha256:${string}`;
  readonly appId: string;
  readonly secretId: string;
  readonly status: "active";
  readonly createdAt: string;
}

export interface LegacyTenantBootstrapStorePort {
  inspect(input: {
    readonly companyId: string;
    readonly ownerUserId: string;
    readonly slug: string;
    readonly appId: string;
    readonly externalTenantDigest: `sha256:${string}`;
  }): Promise<"READY" | "ALREADY_PRESENT" | "CONFLICT">;
  bootstrap(input: {
    readonly registration: TenantRegistrationRecord;
    readonly secret: EncryptedTenantSecret;
    readonly binding: ActiveLegacyTenantBinding;
  }): Promise<"CREATED" | "ALREADY_PRESENT" | "CONFLICT">;
}
