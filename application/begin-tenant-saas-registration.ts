import { createTenantRegistration, type TenantRegistrationRecord } from
  "../core/tenant-registration.ts";
import type { IdentityBindingVerificationPort } from
  "../ports/identity-binding-verification-port.ts";
import type { EncryptedTenantSecret } from "../ports/tenant-secret-store-port.ts";
import type { TenantSaasProvisioningStorePort } from
  "../ports/tenant-saas-provisioning-store-port.ts";

interface TenantSecretSealer {
  seal(input: {
    readonly id: string;
    readonly ownerReference: string;
    readonly purpose: "IDENTITY_PROVIDER_CLIENT_SECRET";
    readonly plaintext: string;
    readonly createdAt: string;
  }): EncryptedTenantSecret;
}

export class BeginTenantSaasRegistration {
  readonly #verify: IdentityBindingVerificationPort;
  readonly #store: TenantSaasProvisioningStorePort;
  readonly #envelope: TenantSecretSealer;
  readonly #nextId: () => string;
  readonly #now: () => string;
  readonly #reservedExternalTenantDigests: ReadonlySet<string>;

  constructor(input: {
    readonly verify: IdentityBindingVerificationPort;
    readonly store: TenantSaasProvisioningStorePort;
    readonly envelope: TenantSecretSealer;
    readonly nextId: () => string;
    readonly now: () => string;
    readonly reservedExternalTenantDigests?: ReadonlySet<string>;
  }) {
    this.#verify = input.verify;
    this.#store = input.store;
    this.#envelope = input.envelope;
    this.#nextId = input.nextId;
    this.#now = input.now;
    const reserved = new Set(input.reservedExternalTenantDigests ?? []);
    if ([...reserved].some((value) => !/^sha256:[a-f0-9]{64}$/.test(value))) {
      throw new Error("TENANT_RESERVED_IDENTITY_DIGEST_INVALID");
    }
    this.#reservedExternalTenantDigests = reserved;
  }

  async begin(input: {
    readonly slug: string;
    readonly companyName: string;
    readonly appId: string;
    readonly appSecret: string;
    readonly signupInviteDigest?: `hmac-sha256:${string}`;
  }): Promise<TenantRegistrationRecord & {
    readonly providerId: string;
    readonly tenantDisplayName: string;
  }> {
    const now = this.#now();
    const registrationId = this.#nextId();
    const bindingId = this.#nextId();
    const secretId = this.#nextId();
    const requestedBy = this.#nextId();
    const registration = createTenantRegistration({
      id: registrationId,
      mode: "SHARED_SAAS",
      slug: input.slug,
      companyName: input.companyName,
      requestedBy,
      identityBindingId: bindingId,
      now,
    });
    if (Buffer.byteLength(input.appSecret, "utf8") < 1 || Buffer.byteLength(input.appSecret, "utf8") > 4_096) {
      throw new Error("IDENTITY_PROVIDER_SECRET_INVALID");
    }
    const verified = await this.#verify.verify({ clientId: input.appId, clientSecret: input.appSecret });
    if (this.#reservedExternalTenantDigests.has(verified.externalTenantDigest)) {
      throw new Error("TENANT_IDENTITY_ALREADY_BOUND");
    }
    const publicProviderId = `feishu-${bindingId}`;
    const secret = this.#envelope.seal({
      id: secretId,
      ownerReference: bindingId,
      purpose: "IDENTITY_PROVIDER_CLIENT_SECRET",
      plaintext: input.appSecret,
      createdAt: now,
    });
    const created = await this.#store.provision({
      registration,
      secret,
      binding: {
        id: bindingId,
        registrationId,
        providerFamily: verified.providerFamily,
        providerKey: verified.providerKey,
        publicProviderId,
        externalTenantDigest: verified.externalTenantDigest,
        appId: verified.clientId,
        secretId,
        createdAt: now,
      },
      ...(input.signupInviteDigest ? { signupInviteDigest: input.signupInviteDigest } : {}),
    });
    if (created === "INVITE_USED") throw new Error("TENANT_SIGNUP_NOT_ALLOWED");
    if (created !== "CREATED") throw new Error("TENANT_REGISTRATION_CONFLICT");
    return { ...registration, providerId: publicProviderId, tenantDisplayName: verified.tenantDisplayName };
  }
}
