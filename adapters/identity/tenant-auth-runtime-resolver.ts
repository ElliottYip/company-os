import type { EncryptedTenantSecret } from "../../ports/tenant-secret-store-port.ts";
import type { CompanyFeishuConfiguration } from "./better-auth-options.ts";
import type { TenantAuthRouteResolver, TenantAuthRuntime } from "./tenant-auth-router.ts";

export interface TenantAuthBindingMaterial {
  readonly bindingId: string;
  readonly registrationId: string;
  readonly slug: string;
  readonly registrationStatus: "PENDING_IDENTITY" | "IDENTITY_VERIFIED" | "COMPLETED" | string;
  readonly expiresAt: string;
  readonly companyId: string | null;
  readonly providerFamily: string;
  readonly providerKey: string;
  readonly providerId: string;
  readonly tenantDigest: string;
  readonly appId: string;
  readonly bindingStatus: string;
  readonly bindingRevision: number;
  readonly secret: EncryptedTenantSecret;
  readonly secretRevokedAt: string | null;
}

export interface TenantAuthBindingMaterialSource {
  findBySlug(slug: string): Promise<TenantAuthBindingMaterial | null>;
  findByProviderId(providerId: string): Promise<TenantAuthBindingMaterial | null>;
}

const PORTABLE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TENANT_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;
const PROVIDER_ID = /^feishu-[a-z0-9](?:[a-z0-9-]{1,92}[a-z0-9])?$/;
const TENANT_DIGEST = /^sha256:[a-f0-9]{64}$/;
const FEISHU_APP_ID = /^[A-Za-z0-9_-]{3,255}$/;
const MAXIMUM_CACHED_RUNTIMES = 256;

export function tenantOAuthCallbackUri(authBaseUrl: string, providerId: string): string {
  if (!PROVIDER_ID.test(providerId)) throw new Error("TENANT_AUTH_PROVIDER_ID_INVALID");
  let base: URL;
  try { base = new URL(authBaseUrl); } catch { throw new Error("TENANT_AUTH_BASE_URL_INVALID"); }
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) {
    throw new Error("TENANT_AUTH_BASE_URL_INVALID");
  }
  return new URL(`/api/auth/oauth2/callback/${providerId}`, base.origin).href;
}

function valid(material: TenantAuthBindingMaterial, now: string): boolean {
  const pendingRegistration = ["PENDING_IDENTITY", "IDENTITY_VERIFIED"].includes(material.registrationStatus);
  const pending = material.bindingStatus === "pending" && material.companyId === null && pendingRegistration &&
    Number.isFinite(Date.parse(material.expiresAt)) && Date.parse(now) < Date.parse(material.expiresAt);
  const active = material.bindingStatus === "active" && material.companyId !== null &&
    material.registrationStatus === "COMPLETED" && PORTABLE_ID.test(material.companyId);
  return (pending || active) && PORTABLE_ID.test(material.bindingId) &&
    PORTABLE_ID.test(material.registrationId) && TENANT_SLUG.test(material.slug) &&
    material.providerFamily === "OAUTH2" && material.providerKey === "feishu" &&
    PROVIDER_ID.test(material.providerId) && TENANT_DIGEST.test(material.tenantDigest) &&
    FEISHU_APP_ID.test(material.appId) && Number.isSafeInteger(material.bindingRevision) &&
    material.bindingRevision > 0 && material.secret.ownerReference === material.bindingId &&
    material.secret.purpose === "IDENTITY_PROVIDER_CLIENT_SECRET" && material.secretRevokedAt === null;
}

export function createTenantAuthRuntimeResolver(input: {
  readonly authBaseUrl: string;
  readonly sessionSecret: string;
  readonly instanceId?: string;
  readonly trustedProxyCidrs?: readonly string[];
  readonly trustedWebOrigins?: readonly string[];
  readonly source: TenantAuthBindingMaterialSource;
  readonly envelope: {
    open(record: EncryptedTenantSecret, expected: {
      readonly ownerReference: string;
      readonly purpose: "IDENTITY_PROVIDER_CLIENT_SECRET";
    }): string;
  };
  readonly assertedEmailHmacKey: Buffer;
  readonly legacyTenantDigest?: string;
  readonly createHandler: (configuration: CompanyFeishuConfiguration) =>
    (request: Request) => Promise<Response>;
  readonly now?: () => string;
}): TenantAuthRouteResolver {
  const now = input.now ?? (() => new Date().toISOString());
  const cache = new Map<string, { readonly version: string; readonly runtime: TenantAuthRuntime }>();

  function build(material: TenantAuthBindingMaterial): TenantAuthRuntime | null {
    if (!valid(material, now())) return null;
    const version = [material.bindingRevision, material.secret.id, material.secret.keyVersion].join(":");
    const cached = cache.get(material.bindingId);
    if (cached?.version === version) return cached.runtime;
    const appSecret = input.envelope.open(material.secret, {
      ownerReference: material.bindingId,
      purpose: "IDENTITY_PROVIDER_CLIENT_SECRET",
    });
    const configuration: CompanyFeishuConfiguration = {
      provider: "FEISHU",
      baseUrl: input.authBaseUrl,
      redirectUri: tenantOAuthCallbackUri(input.authBaseUrl, material.providerId),
      appId: material.appId,
      appSecret,
      providerId: material.providerId,
      expectedTenantDigest: material.tenantDigest,
      tenantScopedAlias: true,
      assertedEmailHmacKey: input.assertedEmailHmacKey,
      sessionSecret: input.sessionSecret,
      ...(input.instanceId ? { instanceId: input.instanceId } : {}),
      ...(input.trustedProxyCidrs ? { trustedProxyCidrs: input.trustedProxyCidrs } : {}),
      ...(input.trustedWebOrigins ? { trustedWebOrigins: input.trustedWebOrigins } : {}),
    };
    const runtime: TenantAuthRuntime = {
      slug: material.slug,
      providerId: material.providerId,
      status: "ACTIVE",
      handle: input.createHandler(configuration),
    };
    cache.delete(material.bindingId);
    cache.set(material.bindingId, { version, runtime });
    while (cache.size > MAXIMUM_CACHED_RUNTIMES) cache.delete(cache.keys().next().value!);
    return runtime;
  }

  return {
    async resolveLegacyBySlug(slug) {
      if (!TENANT_SLUG.test(slug) || !input.legacyTenantDigest ||
          !TENANT_DIGEST.test(input.legacyTenantDigest)) return false;
      const material = await input.source.findBySlug(slug);
      return material?.slug === slug && material.registrationStatus === "COMPLETED" &&
        material.bindingStatus === "active" && material.companyId !== null &&
        valid(material, now()) && material.tenantDigest === input.legacyTenantDigest;
    },
    async resolveBySlug(slug) {
      const material = await input.source.findBySlug(slug);
      return material?.slug === slug ? build(material) : null;
    },
    async resolveByProviderId(providerId) {
      const material = await input.source.findByProviderId(providerId);
      return material?.providerId === providerId ? build(material) : null;
    },
  };
}
