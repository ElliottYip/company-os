export interface VerifiedIdentityBinding {
  readonly providerFamily: "OAUTH2" | "OIDC";
  readonly providerKey: string;
  readonly clientId: string;
  readonly externalTenantDigest: `sha256:${string}`;
  readonly tenantDisplayName: string;
}
export interface IdentityBindingVerificationPort {
  verify(input: {
    readonly clientId: string;
    readonly clientSecret: string;
  }): Promise<VerifiedIdentityBinding>;
}
