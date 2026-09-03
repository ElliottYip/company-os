import type { TenantRegistrationRecord } from "../core/tenant-registration.ts";
import type { EncryptedTenantSecret } from "./tenant-secret-store-port.ts";

export interface PendingTenantIdentityBinding {
  readonly id: string;
  readonly registrationId: string;
  readonly providerFamily: "OAUTH2" | "OIDC";
  readonly providerKey: string;
  readonly publicProviderId: string;
  readonly externalTenantDigest: `sha256:${string}`;
  readonly appId: string;
  readonly secretId: string;
  readonly createdAt: string;
}

export interface TenantSaasProvisioningStorePort {
  provision(input: {
    readonly registration: TenantRegistrationRecord;
    readonly secret: EncryptedTenantSecret;
    readonly binding: PendingTenantIdentityBinding;
    readonly signupInviteDigest?: `hmac-sha256:${string}`;
  }): Promise<"CREATED" | "CONFLICT" | "INVITE_USED">;
}
