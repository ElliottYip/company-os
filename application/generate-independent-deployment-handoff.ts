export interface IndependentDeploymentHandoff {
  readonly schemaVersion: 1;
  readonly mode: "INDEPENDENT";
  readonly company: { readonly name: string; readonly slug: string };
  readonly release: { readonly id: string; readonly migration: "0009_tenant_signup_invites" };
  readonly endpoint: { readonly origin: string; readonly identityCallbackUrl: string | null };
  readonly identity: {
    readonly provider: "FEISHU" | "OIDC" | "CUSTOM_ADAPTER";
    readonly configurationReference: string;
    readonly secretSource: "CUSTOMER_ENVIRONMENT_ONLY";
  };
  readonly deployment: {
    readonly profile: "self-hosted";
    readonly images: readonly ["company-os-api", "company-os-web"];
    readonly requiredSecretNames: readonly string[];
  };
  readonly acceptance: readonly string[];
  readonly rollback: readonly string[];
}

const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;
const CONFIGURATION_REFERENCE = /^[A-Za-z0-9_@./-]{3,255}$/;
const RELEASE_ID = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?-[a-f0-9]{12}$/;

export function generateIndependentDeploymentHandoff(input: {
  readonly companyName: string;
  readonly slug: string;
  readonly domain: string;
  readonly appId: string;
  readonly identityProvider?: "FEISHU" | "OIDC" | "CUSTOM_ADAPTER";
  readonly releaseId: string;
}): IndependentDeploymentHandoff {
  const companyName = input.companyName.trim();
  const slug = input.slug.trim().toLocaleLowerCase("en-US");
  const appId = input.appId.trim();
  if (!companyName || [...companyName].length > 160) throw new Error("TENANT_COMPANY_NAME_INVALID");
  if (!SLUG.test(slug)) throw new Error("TENANT_SLUG_INVALID");
  if (!CONFIGURATION_REFERENCE.test(appId) || appId.includes("..")) {
    throw new Error("IDENTITY_PROVIDER_CONFIGURATION_REFERENCE_INVALID");
  }
  const identityProvider = input.identityProvider ?? "FEISHU";
  if (!["FEISHU", "OIDC", "CUSTOM_ADAPTER"].includes(identityProvider)) {
    throw new Error("IDENTITY_PROVIDER_INVALID");
  }
  if (!RELEASE_ID.test(input.releaseId)) throw new Error("RELEASE_ID_INVALID");
  let origin: string;
  try {
    const url = new URL(`https://${input.domain.trim().toLocaleLowerCase("en-US")}`);
    if (url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash ||
        !url.hostname.includes(".") || url.hostname === "localhost") throw new Error("INVALID");
    origin = url.origin;
  } catch { throw new Error("CUSTOMER_DOMAIN_INVALID"); }
  return {
    schemaVersion: 1,
    mode: "INDEPENDENT",
    company: { name: companyName, slug },
    release: { id: input.releaseId, migration: "0009_tenant_signup_invites" },
    endpoint: {
      origin,
      identityCallbackUrl: identityProvider === "FEISHU"
        ? `${origin}/api/auth/oauth2/callback/feishu`
        : identityProvider === "OIDC" ? `${origin}/api/auth/oauth2/callback/enterprise-oidc` : null,
    },
    identity: {
      provider: identityProvider,
      configurationReference: appId,
      secretSource: "CUSTOMER_ENVIRONMENT_ONLY",
    },
    deployment: {
      profile: "self-hosted",
      images: ["company-os-api", "company-os-web"],
      requiredSecretNames: identityProvider === "FEISHU"
        ? ["COMPANY_OS_FEISHU_APP_SECRET", "COMPANY_OS_SESSION_SIGNING_KEY"]
        : identityProvider === "OIDC"
          ? ["COMPANY_OS_OIDC_CLIENT_SECRET", "COMPANY_OS_SESSION_SIGNING_KEY"]
          : ["CUSTOM_IDENTITY_ADAPTER_SECRET_REFERENCES", "COMPANY_OS_SESSION_SIGNING_KEY"],
    },
    acceptance: [
      "Run database migration before switching traffic",
      "Verify Feishu OAuth callback and tenant lock",
      "Verify backup, readiness, login, owner access, and cross-tenant denial",
    ],
    rollback: [
      "Retain the pre-migration encrypted backup",
      "Restore the prior image digests and routing only after compatibility checks",
    ],
  };
}
