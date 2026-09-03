import type { IdentityBindingVerificationPort } from
  "../ports/identity-binding-verification-port.ts";
import type { LegacyTenantBootstrapStorePort } from
  "../ports/legacy-tenant-bootstrap-store-port.ts";
import type { EncryptedTenantSecret } from "../ports/tenant-secret-store-port.ts";

const PORTABLE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TENANT_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;

interface TenantSecretEnvelope {
  seal(input: {
    readonly id: string;
    readonly ownerReference: string;
    readonly purpose: "IDENTITY_PROVIDER_CLIENT_SECRET";
    readonly plaintext: string;
    readonly createdAt: string;
  }): EncryptedTenantSecret;
}

function id(value: string, code: string): string {
  const normalized = value.trim();
  if (!PORTABLE_ID.test(normalized)) throw new Error(code);
  return normalized;
}

export class BootstrapLegacyTenantRoute {
  readonly #verify: IdentityBindingVerificationPort;
  readonly #store: LegacyTenantBootstrapStorePort;
  readonly #envelope: TenantSecretEnvelope;
  readonly #nextId: () => string;
  readonly #now: () => string;

  constructor(input: {
    readonly verify: IdentityBindingVerificationPort;
    readonly store: LegacyTenantBootstrapStorePort;
    readonly envelope: TenantSecretEnvelope;
    readonly nextId: () => string;
    readonly now: () => string;
  }) {
    this.#verify = input.verify;
    this.#store = input.store;
    this.#envelope = input.envelope;
    this.#nextId = input.nextId;
    this.#now = input.now;
  }

  async #prepare(input: {
    readonly companyId: string;
    readonly ownerUserId: string;
    readonly slug: string;
    readonly appId: string;
    readonly appSecret: string;
  }) {
    const companyId = id(input.companyId, "TENANT_COMPANY_ID_INVALID");
    const ownerUserId = id(input.ownerUserId, "VERIFIED_HUMAN_ID_INVALID");
    const slug = input.slug.trim();
    if (!TENANT_SLUG.test(slug)) throw new Error("TENANT_SLUG_INVALID");
    if (Buffer.byteLength(input.appSecret, "utf8") < 16 || Buffer.byteLength(input.appSecret, "utf8") > 4_096) {
      throw new Error("IDENTITY_PROVIDER_SECRET_INVALID");
    }
    const now = this.#now();
    const timestamp = Date.parse(now);
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== now) {
      throw new Error("LEGACY_TENANT_BOOTSTRAP_CLOCK_INVALID");
    }
    const verified = await this.#verify.verify({ clientId: input.appId, clientSecret: input.appSecret });
    if (verified.providerFamily !== "OAUTH2" || verified.providerKey !== "feishu") {
      throw new Error("LEGACY_TENANT_IDENTITY_PROVIDER_INVALID");
    }
    return { companyId, ownerUserId, slug, now, timestamp, verified };
  }

  async preflight(input: {
    readonly companyId: string;
    readonly ownerUserId: string;
    readonly slug: string;
    readonly appId: string;
    readonly appSecret: string;
  }): Promise<{ readonly status: "READY" | "ALREADY_PRESENT"; readonly companyId: string; readonly slug: string }> {
    const prepared = await this.#prepare(input);
    const result = await this.#store.inspect({
      companyId: prepared.companyId,
      ownerUserId: prepared.ownerUserId,
      slug: prepared.slug,
      appId: prepared.verified.clientId,
      externalTenantDigest: prepared.verified.externalTenantDigest,
    });
    if (result === "CONFLICT") throw new Error("LEGACY_TENANT_BOOTSTRAP_CONFLICT");
    return { status: result, companyId: prepared.companyId, slug: prepared.slug };
  }

  async bootstrap(input: {
    readonly companyId: string;
    readonly ownerUserId: string;
    readonly slug: string;
    readonly appId: string;
    readonly appSecret: string;
  }): Promise<{ readonly status: "CREATED" | "ALREADY_PRESENT"; readonly companyId: string; readonly slug: string }> {
    const prepared = await this.#prepare(input);
    const registrationId = id(this.#nextId(), "TENANT_REGISTRATION_ID_INVALID");
    const bindingId = id(this.#nextId(), "IDENTITY_BINDING_ID_INVALID");
    const secretId = id(this.#nextId(), "TENANT_SECRET_ID_INVALID");
    const secret = this.#envelope.seal({
      id: secretId, ownerReference: bindingId, purpose: "IDENTITY_PROVIDER_CLIENT_SECRET",
      plaintext: input.appSecret, createdAt: prepared.now,
    });
    const result = await this.#store.bootstrap({
      registration: {
        schemaVersion: 1,
        id: registrationId,
        mode: "SHARED_SAAS",
        slug: prepared.slug,
        companyName: prepared.verified.tenantDisplayName,
        requestedBy: prepared.ownerUserId,
        identityBindingId: bindingId,
        status: "COMPLETED",
        revision: 3,
        createdAt: prepared.now,
        expiresAt: new Date(prepared.timestamp + 15 * 60_000).toISOString(),
        verifiedAt: prepared.now,
        verifiedHumanId: prepared.ownerUserId,
        externalTenantDigest: prepared.verified.externalTenantDigest,
        completedAt: prepared.now,
        companyId: prepared.companyId,
      },
      secret,
      binding: {
        id: bindingId,
        registrationId,
        companyId: prepared.companyId,
        providerFamily: "OAUTH2",
        providerKey: "feishu",
        publicProviderId: `feishu-${bindingId}`,
        externalTenantDigest: prepared.verified.externalTenantDigest,
        appId: prepared.verified.clientId,
        secretId,
        status: "active",
        createdAt: prepared.now,
      },
    });
    if (result === "CONFLICT") throw new Error("LEGACY_TENANT_BOOTSTRAP_CONFLICT");
    return { status: result, companyId: prepared.companyId, slug: prepared.slug };
  }
}
