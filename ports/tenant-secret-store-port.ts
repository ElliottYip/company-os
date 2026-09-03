export type TenantSecretPurpose =
  | "IDENTITY_PROVIDER_CLIENT_SECRET"
  | "IDENTITY_PROVIDER_REFRESH_SECRET";

export interface EncryptedTenantSecret {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly ownerReference: string;
  readonly purpose: TenantSecretPurpose;
  readonly algorithm: "AES-256-GCM";
  readonly keyVersion: string;
  readonly nonce: string;
  readonly ciphertext: string;
  readonly authenticationTag: string;
  readonly createdAt: string;
}
export interface TenantSecretStorePort {
  create(secret: EncryptedTenantSecret): Promise<"CREATED" | "ALREADY_EXISTS">;
  findById(id: string): Promise<EncryptedTenantSecret | null>;
}
