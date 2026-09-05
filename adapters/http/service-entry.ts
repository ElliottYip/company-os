import { createHash, randomBytes } from "node:crypto";
import { createDemoComposition } from "../demo/create-demo-composition.ts";
import { createDemoPortfolioFixture } from "../demo/create-demo-portfolio-fixture.ts";
import { InMemoryDemoSessionStore } from "../storage/in-memory-demo-session-store.ts";
import { DemoPortfolioSessions } from "../../application/demo-portfolio-sessions.ts";
import { getFormalAccessStatus } from "../../application/get-formal-access-status.ts";
import {
  createCompanyAuth,
  createCompanyAuthHandler,
  createCompanyAuthWebHandler,
  resolveCompanyAuthSession,
} from "../identity/better-auth-instance.ts";
import {
  createTenantAuthRuntimeResolver,
  tenantOAuthCallbackUri,
} from "../identity/tenant-auth-runtime-resolver.ts";
import { createTenantAuthNodeHandler } from "../identity/tenant-auth-router.ts";
import { createTenantSecretEnvelope } from "../security/tenant-secret-envelope.ts";
import { createTenantSignupInviteGate } from "../security/tenant-signup-invite-gate.ts";
import { PostgresTenantAuthBindingSource } from
  "../persistence/postgres/postgres-tenant-auth-binding-source.ts";
import { createCompanyDatabase } from "../persistence/postgres/company-database.ts";
import { createCompanyAccessDirectory } from "../persistence/postgres/company-access-directory.ts";
import {
  createPostgresCompanyAccessStore,
  nextPostgresRecordId,
} from "../persistence/postgres/postgres-company-access-store.ts";
import { CompanyBootstrapService } from "../../application/company-bootstrap.ts";
import { CompleteTenantSaasRegistration } from
  "../../application/complete-tenant-saas-registration.ts";
import { BeginTenantSaasRegistration } from
  "../../application/begin-tenant-saas-registration.ts";
import { generateIndependentDeploymentHandoff } from
  "../../application/generate-independent-deployment-handoff.ts";
import { RestoreCompanyFromBackup } from "../../application/restore-company-from-backup.ts";
import { CompanyRegistry } from "../../application/company-registry.ts";
import { SetupInitialOrganization } from "../../application/setup-initial-organization.ts";
import { ArchiveDepartment, ReviseCompanyOrganization, TransferAgentResponsibility, UpdateCompanyProfile } from "../../application/revise-company-organization.ts";
import { ArchiveCompany } from "../../application/archive-company.ts";
import { AcceptHumanInvite, CreateHumanInvite } from "../../application/human-invites.ts";
import { ManageCompanyMembers } from "../../application/manage-company-members.ts";
import { GetAgentBossProjection } from "../../application/get-agent-boss-projection.ts";
import { GetAdministrationProjection } from "../../application/get-administration-projection.ts";
import { DispatchAccountableWork } from "../../application/dispatch-accountable-work.ts";
import { AccessGovernedData } from "../../application/access-governed-data.ts";
import { IssueSecretLease } from "../../application/issue-secret-lease.ts";
import { PrepareWorkExecution } from "../../application/prepare-work-execution.ts";
import { DecideHighRiskAction } from "../../application/decide-high-risk-action.ts";
import { FormalAgentBossApi } from "../../application/formal-agent-boss-api.ts";
import { FormalAgentPortfolioApi } from "../../application/formal-agent-portfolio-api.ts";
import { ManageAgentPortfolio } from "../../application/manage-agent-portfolio.ts";
import { RegisterExternalWork } from "../../application/register-external-work.ts";
import { ManageAgentCommercialGovernance } from "../../application/manage-agent-commercial-governance.ts";
import { ConnectorRegistry } from "../../application/connector-registry.ts";
import { GovernanceRegistry } from "../../application/governance-registry.ts";
import { ResponsibilityRegistry } from "../../application/responsibility-registry.ts";
import { SessionCompanyIdentityAdapter } from "../identity/session-company-identity-adapter.ts";
import { PostgresEventStore } from "../persistence/postgres/postgres-event-store.ts";
import { createPostgresHumanInviteStore } from "../persistence/postgres/postgres-human-invite-store.ts";
import { PostgresCompanyRestoreStore } from "../persistence/postgres/postgres-company-restore-store.ts";
import { PostgresInstanceMaintenanceStore } from "../persistence/postgres/postgres-instance-maintenance-store.ts";
import { PostgresTenantSaasCompletionStore } from
  "../persistence/postgres/postgres-tenant-saas-completion-store.ts";
import { PostgresTenantSaasProvisioningStore } from
  "../persistence/postgres/postgres-tenant-saas-provisioning-store.ts";
import { PostgresTenantInviteIdentity } from
  "../persistence/postgres/postgres-tenant-invite-identity.ts";
import { createFeishuIdentityBindingVerifier } from
  "../identity/feishu-identity-binding-verifier.ts";
import { EventBackedOrganizationPrincipalStore } from "../storage/event-backed-organization-principal-store.ts";
import { EventBackedResponsibilityContractStore } from "../storage/event-backed-responsibility-contract-store.ts";
import { EventBackedApprovalStore } from "../storage/event-backed-approval-store.ts";
import { EventBackedConnectorCatalogStore } from "../storage/event-backed-connector-catalog-store.ts";
import { EventBackedGovernanceCatalogStore } from "../storage/event-backed-governance-catalog-store.ts";
import { EventBackedGenericWorkStore } from "../storage/event-backed-generic-work-store.ts";
import { EventBackedAgentLifecycleStore } from "../storage/event-backed-agent-lifecycle-store.ts";
import { EventBackedAgentRuntimeBindingStore } from "../storage/event-backed-agent-runtime-binding-store.ts";
import { ManageAgentLifecycle } from "../../application/manage-agent-lifecycle.ts";
import { ManageAgentRuntimeBinding } from "../../application/manage-agent-runtime-binding.ts";
import { ScheduleWorkAttempt } from "../../application/schedule-work-attempt.ts";
import { DeliverConnectorCommands } from "../../application/deliver-connector-commands.ts";
import { Sha256ConnectorRuntimeSecurity } from "../connectors/sha256-connector-runtime-security.ts";
import { startConnectorCommandSupervisor } from "../connectors/connector-command-supervisor.ts";
import { RedriveConnectorCommands } from "../../application/redrive-connector-commands.ts";
import { ReconcileConnectorControlPlane } from "../../application/reconcile-connector-control-plane.ts";
import { RecoverExpiredWorkAttempts } from "../../application/recover-expired-work-attempts.ts";
import { PlanningRegistry } from "../../application/planning-registry.ts";
import { EventBackedPlanningStore } from "../storage/event-backed-planning-store.ts";
import { EventBackedToolAccessCatalogStore } from "../storage/event-backed-tool-access-catalog-store.ts";
import { EventBackedUsageBudgetStore } from "../storage/event-backed-usage-budget-store.ts";
import { CollectConnectorObservations } from "../../application/collect-connector-observations.ts";
import { ProcessOperationalRiskObservation } from "../../application/process-operational-risk-observation.ts";
import { IngestConnectorUsage } from "../../application/ingest-connector-usage.ts";
import { WorkAttemptService } from "../../application/work-attempt-service.ts";
import { RequestWorkCancellation } from "../../application/request-work-cancellation.ts";
import { ReconcileWorkAttempt } from "../../application/reconcile-work-attempt.ts";
import { RetryWorkAttempt } from "../../application/retry-work-attempt.ts";
import { RetryWorkExecutionPreparation } from "../../application/retry-work-execution-preparation.ts";
import { GetWorkRunTimeline } from "../../application/get-work-run-timeline.ts";
import { GetCompanyActivity } from "../../application/get-company-activity.ts";
import { GetAccountabilityLedger } from "../../application/get-accountability-ledger.ts";
import { ExportAccountabilityPackage } from "../../application/export-accountability-package.ts";
import { RevokeAttemptSecretLeases } from "../../application/revoke-attempt-secret-leases.ts";
import { ManageConnectorRuntimeRegistration } from "../../application/manage-connector-runtime-registration.ts";
import { ManageDataAuthorizationContract } from "../../application/manage-data-authorization-contract.ts";
import { ManageModelRoute } from "../../application/manage-model-route.ts";
import { ResolveWorkModelRoute } from "../../application/resolve-work-model-route.ts";
import { ManageToolAccess } from "../../application/manage-tool-access.ts";
import { ManageUsageBudget } from "../../application/manage-usage-budget.ts";
import { AuthorizeWorkBudget } from "../../application/authorize-work-budget.ts";
import { ManageInstanceMaintenance } from "../../application/manage-instance-maintenance.ts";
import { ManageSecretReference } from "../../application/manage-secret-reference.ts";
import type { SecretBrokerManagementPort } from "../../ports/secret-broker-management-port.ts";
import {
  loadFormalConnectors,
  parseFormalConnectorPackages,
} from "../connectors/load-formal-connectors.ts";
import { createCompanyOsHttpService } from "./company-os-http-service.ts";
import { BoundedHttpMetrics } from "./bounded-http-metrics.ts";
import { PublicDemoRequestLimiter } from "./public-demo-request-limiter.ts";
import { TenantSignupRequestLimiter } from "./tenant-signup-request-limiter.ts";
import { TrustedClientAddressResolver } from "./trusted-client-address.ts";
import {
  loadFormalSecretBroker,
  parseFormalSecretBrokerPackage,
} from "../secrets/load-formal-secret-broker.ts";
import {
  loadFormalModelProviders,
  parseFormalModelProviderPackages,
} from "../models/load-formal-model-providers.ts";
import { Sha256ModelRuntimeSecurity } from "../models/sha256-model-runtime-security.ts";
import { Sha256ContentDigest } from "../security/sha256-content-digest.ts";
import {
  parseCompanyIdentityProvider,
  parseTrustedProxyCidrs,
} from "../identity/better-auth-options.ts";
import { parseAllowedWebOrigins } from "./allowed-web-origins.ts";
import { loadFormalDataConnectors, parseFormalDataConnectorPackages } from "../data/load-formal-data-connectors.ts";
import { operationalLogLine } from "./structured-operational-log.ts";
import { getOperationalReadiness } from "./operational-readiness.ts";
import {
  configuredAccountabilityExportPolicyId as resolveAccountabilityExportPolicyId,
  configuredRetentionPolicyId as resolveRetentionPolicyId,
} from "./retention-policy-configuration.ts";
import { readSecretFileEnvironment } from "../config/secret-file-environment.ts";
import {
  parseServiceRuntimeMode,
  validateServiceRuntimeBoundary,
} from "./service-runtime-mode.ts";
import { SynchronizeFederatedSource } from "../../application/synchronize-federated-source.ts";
import {
  loadFormalFederatedSources,
  parseFormalFederatedSourcePackages,
} from "../connectors/load-formal-federated-sources.ts";
import { dropRuntimePrivileges } from "../security/runtime-privilege-drop.ts";

function deploymentProfile(value: string | undefined): "managed-cloud" | "self-hosted" {
  if (value === undefined || value === "self-hosted") return "self-hosted";
  if (value === "managed-cloud") return value;
  throw new Error("COMPANY_OS_PROFILE must be managed-cloud or self-hosted");
}

function port(value: string | undefined) {
  const parsed = value === undefined ? 4310 : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("COMPANY_OS_PORT must be an integer from 1 to 65535");
  }
  return parsed;
}

function exposure(value: string | undefined): "private" | "public" {
  if (value === undefined || value === "private") return "private";
  if (value === "public") return value;
  throw new Error("COMPANY_OS_EXPOSURE must be private or public");
}

function enabled(value: string | undefined, name: string): boolean {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error(`${name} must be true or false`);
}

function boundedInteger(
  value: string | undefined,
  input: { readonly name: string; readonly defaultValue: number; readonly minimum: number; readonly maximum: number },
): number {
  const parsed = value === undefined ? input.defaultValue : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < input.minimum || parsed > input.maximum) {
    throw new Error(`${input.name} must be an integer from ${input.minimum} to ${input.maximum}`);
  }
  return parsed;
}

function releaseId(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const normalized = value.trim();
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?-[a-f0-9]{12}$/.test(normalized)) {
    throw new Error("COMPANY_OS_RELEASE_ID_INVALID");
  }
  return normalized;
}

const profile = deploymentProfile(process.env.COMPANY_OS_PROFILE);
const deploymentExposure = exposure(process.env.COMPANY_OS_EXPOSURE);
const publicDemoEnabled = enabled(
  process.env.COMPANY_OS_PUBLIC_DEMO_ENABLED,
  "COMPANY_OS_PUBLIC_DEMO_ENABLED",
);
const multiTenantSaasEnabled = enabled(
  process.env.COMPANY_OS_MULTI_TENANT_SAAS_ENABLED,
  "COMPANY_OS_MULTI_TENANT_SAAS_ENABLED",
);
const unrestrictedTenantSignup = enabled(
  process.env.COMPANY_OS_TENANT_PUBLIC_SIGNUP_UNRESTRICTED,
  "COMPANY_OS_TENANT_PUBLIC_SIGNUP_UNRESTRICTED",
);
const tenantSignupAllowedAppIds = new Set(
  String(process.env.COMPANY_OS_TENANT_SIGNUP_APP_ALLOWLIST ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean),
);
const tenantSignupInviteKeyMaterial = await readSecretFileEnvironment(
  "COMPANY_OS_TENANT_SIGNUP_INVITE_HMAC_KEY",
);
const tenantSignupInviteDigestMaterial = await readSecretFileEnvironment(
  "COMPANY_OS_TENANT_SIGNUP_INVITE_DIGESTS",
);
if ((tenantSignupInviteKeyMaterial === undefined) !== (tenantSignupInviteDigestMaterial === undefined)) {
  throw new Error("TENANT_SIGNUP_INVITE_CONFIGURATION_INCOMPLETE");
}
const tenantSignupInviteGate = tenantSignupInviteKeyMaterial && tenantSignupInviteDigestMaterial
  ? createTenantSignupInviteGate({
      key: /^[A-Za-z0-9_-]{43}$/.test(tenantSignupInviteKeyMaterial)
        ? Buffer.from(tenantSignupInviteKeyMaterial, "base64url")
        : Buffer.alloc(0),
      allowedDigests: new Set(tenantSignupInviteDigestMaterial
        .split(/[\s,]+/).map((value) => value.trim()).filter(Boolean)),
    })
  : null;
if ([...tenantSignupAllowedAppIds].some((value) => !/^[A-Za-z0-9_-]{3,255}$/.test(value))) {
  throw new Error("TENANT_SIGNUP_APP_ALLOWLIST_INVALID");
}
if (multiTenantSaasEnabled && !unrestrictedTenantSignup && tenantSignupAllowedAppIds.size === 0 &&
    !tenantSignupInviteGate) {
  throw new Error("TENANT_SIGNUP_ADMISSION_REQUIRED");
}
const tenantSignupLimiter = multiTenantSaasEnabled ? new TenantSignupRequestLimiter({
  maximumRequestsPerWindow: boundedInteger(process.env.COMPANY_OS_TENANT_SIGNUPS_PER_MINUTE, {
    name: "COMPANY_OS_TENANT_SIGNUPS_PER_MINUTE", defaultValue: 20, minimum: 1, maximum: 1_000,
  }),
}) : null;
const demoMaximumSessions = boundedInteger(process.env.COMPANY_OS_DEMO_MAX_SESSIONS, {
  name: "COMPANY_OS_DEMO_MAX_SESSIONS", defaultValue: 500, minimum: 1, maximum: 10_000,
});
const demoCreationsPerMinute = boundedInteger(process.env.COMPANY_OS_DEMO_CREATIONS_PER_MINUTE, {
  name: "COMPANY_OS_DEMO_CREATIONS_PER_MINUTE", defaultValue: 120, minimum: 1, maximum: 10_000,
});
const demoRequestsPerSessionPerMinute = boundedInteger(
  process.env.COMPANY_OS_DEMO_REQUESTS_PER_SESSION_PER_MINUTE,
  {
    name: "COMPANY_OS_DEMO_REQUESTS_PER_SESSION_PER_MINUTE",
    defaultValue: 240,
    minimum: 1,
    maximum: 100_000,
  },
);
const runtimeMode = parseServiceRuntimeMode(process.env.COMPANY_OS_RUNTIME_MODE);
const metricsEnabled = process.env.COMPANY_OS_METRICS_ENABLED === "true";
const runtimeMetrics = metricsEnabled ? new BoundedHttpMetrics() : null;
if (metricsEnabled && deploymentExposure !== "private") {
  throw new Error("COMPANY_OS_METRICS_PRIVATE_EXPOSURE_REQUIRED");
}
const host = process.env.COMPANY_OS_HOST?.trim() || "127.0.0.1";
const listenPort = port(process.env.COMPANY_OS_PORT);
const deployedReleaseId = releaseId(process.env.COMPANY_OS_RELEASE_ID);
const trustedProxyCidrs = parseTrustedProxyCidrs(process.env.COMPANY_OS_TRUSTED_PROXY_CIDRS);
const tenantSignupClientAddress = new TrustedClientAddressResolver(trustedProxyCidrs);
const configuredRetentionPolicyId = resolveRetentionPolicyId(process.env.COMPANY_OS_RETENTION_POLICY_ID);
const configuredAccountabilityExportPolicyId = resolveAccountabilityExportPolicyId(
  process.env.COMPANY_OS_ACCOUNTABILITY_EXPORT_POLICY_ID,
);
const { runtime } = createDemoComposition();
const demoNow = () => new Date().toISOString();
const publicDemoSessions = publicDemoEnabled ? new DemoPortfolioSessions({
  store: new InMemoryDemoSessionStore({ maximumSessions: demoMaximumSessions, now: demoNow }),
  createFixture: createDemoPortfolioFixture,
  nextSessionId: () => randomBytes(32).toString("base64url"),
  nextCompanyId: () => `demo-company-${randomBytes(12).toString("hex")}`,
  now: demoNow,
  timeToLiveMilliseconds: 4 * 60 * 60 * 1_000,
}) : undefined;
const publicDemoRequestLimiter = publicDemoEnabled ? new PublicDemoRequestLimiter({
  maximumCreationsPerWindow: demoCreationsPerMinute,
  maximumRequestsPerSessionPerWindow: demoRequestsPerSessionPerMinute,
  maximumTrackedSessions: demoMaximumSessions,
  windowMilliseconds: 60_000,
}) : undefined;
const identityProvider = parseCompanyIdentityProvider(process.env.COMPANY_OS_IDENTITY_PROVIDER);
const formalConfiguration = {
  provider: identityProvider,
  publicBaseUrl: process.env.COMPANY_OS_PUBLIC_URL,
  issuer: process.env.COMPANY_OS_OIDC_ISSUER,
  discoveryUrl: process.env.COMPANY_OS_OIDC_DISCOVERY_URL,
  clientId: process.env.COMPANY_OS_OIDC_CLIENT_ID,
  clientSecret: identityProvider === "OIDC"
    ? await readSecretFileEnvironment("COMPANY_OS_OIDC_CLIENT_SECRET")
    : undefined,
  redirectUri: identityProvider === "FEISHU"
    ? process.env.COMPANY_OS_FEISHU_REDIRECT_URI
    : process.env.COMPANY_OS_OIDC_REDIRECT_URI,
  feishuAppId: process.env.COMPANY_OS_FEISHU_APP_ID,
  feishuAppSecret: identityProvider === "FEISHU"
    ? await readSecretFileEnvironment("COMPANY_OS_FEISHU_APP_SECRET")
    : undefined,
  feishuTenantKey: process.env.COMPANY_OS_FEISHU_TENANT_KEY,
  sessionSigningKey: await readSecretFileEnvironment("COMPANY_OS_SESSION_SIGNING_KEY"),
  databaseUrl: await readSecretFileEnvironment("COMPANY_OS_DATABASE_URL"),
};
validateServiceRuntimeBoundary({
  mode: runtimeMode,
  publicDemoEnabled,
  formalConfigurationPresent: [
    formalConfiguration.issuer,
    formalConfiguration.discoveryUrl,
    formalConfiguration.clientId,
    formalConfiguration.clientSecret,
    formalConfiguration.redirectUri,
    formalConfiguration.sessionSigningKey,
    formalConfiguration.databaseUrl,
    formalConfiguration.feishuAppId,
    formalConfiguration.feishuAppSecret,
    formalConfiguration.feishuTenantKey,
  ].some((value) => Boolean(value?.trim())),
  connectorConfigurationPresent: [
    process.env.COMPANY_OS_CONNECTOR_PACKAGES,
    process.env.COMPANY_OS_SECRET_BROKER_PACKAGE,
    process.env.COMPANY_OS_MODEL_PROVIDER_PACKAGES,
    process.env.COMPANY_OS_DATA_CONNECTOR_PACKAGES,
    process.env.COMPANY_OS_FEDERATED_SOURCE_PACKAGES,
  ].some((value) => Boolean(value?.trim())),
});
const allowedWebOrigins = parseAllowedWebOrigins(
  process.env.COMPANY_OS_WEB_ORIGINS,
  formalConfiguration.publicBaseUrl,
);
const isFormalConfigured = identityProvider === "FEISHU"
  ? [formalConfiguration.publicBaseUrl, formalConfiguration.feishuAppId,
      formalConfiguration.feishuAppSecret, formalConfiguration.feishuTenantKey,
      formalConfiguration.redirectUri, formalConfiguration.sessionSigningKey,
      formalConfiguration.databaseUrl].every((value) => value?.trim())
  : [formalConfiguration.publicBaseUrl, formalConfiguration.issuer,
      formalConfiguration.discoveryUrl, formalConfiguration.clientId,
      formalConfiguration.clientSecret, formalConfiguration.redirectUri,
      formalConfiguration.sessionSigningKey, formalConfiguration.databaseUrl]
    .every((value) => value?.trim());
const federatedSourcePackages = parseFormalFederatedSourcePackages(
  process.env.COMPANY_OS_FEDERATED_SOURCE_PACKAGES,
);
if (federatedSourcePackages.length && !isFormalConfigured) {
  throw new Error("FEDERATED_SOURCE_FORMAL_RUNTIME_REQUIRED");
}
const formalFederatedSources = await loadFormalFederatedSources(federatedSourcePackages);
const database = isFormalConfigured
  ? createCompanyDatabase(formalConfiguration.databaseUrl as string)
  : null;
const auth = database
  ? createCompanyAuth(database.db, identityProvider === "FEISHU" ? {
      provider: "FEISHU",
      baseUrl: formalConfiguration.publicBaseUrl as string,
      redirectUri: formalConfiguration.redirectUri as string,
      appId: formalConfiguration.feishuAppId as string,
      appSecret: formalConfiguration.feishuAppSecret as string,
      expectedTenantKey: formalConfiguration.feishuTenantKey as string,
      sessionSecret: formalConfiguration.sessionSigningKey as string,
      instanceId: process.env.COMPANY_OS_INSTANCE_ID,
      trustedProxyCidrs,
      trustedWebOrigins: allowedWebOrigins,
    } : {
      provider: "OIDC",
      baseUrl: formalConfiguration.publicBaseUrl as string,
      redirectUri: formalConfiguration.redirectUri as string,
      issuer: formalConfiguration.issuer as string,
      discoveryUrl: formalConfiguration.discoveryUrl as string,
      clientId: formalConfiguration.clientId as string,
      clientSecret: formalConfiguration.clientSecret as string,
      sessionSecret: formalConfiguration.sessionSigningKey as string,
      instanceId: process.env.COMPANY_OS_INSTANCE_ID,
      trustedProxyCidrs,
      trustedWebOrigins: allowedWebOrigins,
    })
  : null;
function tenantMasterKey(encodedSecret: string | undefined): { readonly version: string; readonly key: Buffer } {
  const version = process.env.COMPANY_OS_TENANT_SECRET_KEY_VERSION?.trim() ?? "";
  const encoded = encodedSecret?.trim() ?? "";
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(version) || !/^[A-Za-z0-9_-]{43}$/.test(encoded)) {
    throw new Error("TENANT_SECRET_MASTER_KEY_CONFIGURATION_INVALID");
  }
  const key = Buffer.from(encoded, "base64url");
  if (key.length !== 32 || key.toString("base64url") !== encoded) {
    throw new Error("TENANT_SECRET_MASTER_KEY_CONFIGURATION_INVALID");
  }
  return { version, key };
}
const tenantMasterKeySecret = multiTenantSaasEnabled
  ? await readSecretFileEnvironment("COMPANY_OS_TENANT_SECRET_MASTER_KEY")
  : undefined;
const tenantMasterKeyMaterial = multiTenantSaasEnabled
  ? tenantMasterKey(tenantMasterKeySecret)
  : null;
const tenantSecretEnvelope = multiTenantSaasEnabled ? (() => {
  return createTenantSecretEnvelope({
    activeKeyVersion: tenantMasterKeyMaterial!.version,
    keys: new Map([[tenantMasterKeyMaterial!.version, tenantMasterKeyMaterial!.key]]),
  });
})() : null;
const tenantAuthHandler = multiTenantSaasEnabled ? (() => {
  if (!database || !auth || !formalConfiguration.publicBaseUrl ||
      !formalConfiguration.sessionSigningKey) throw new Error("TENANT_AUTH_FORMAL_RUNTIME_REQUIRED");
  const webBaseUrl = process.env.COMPANY_OS_TENANT_WEB_BASE_URL?.trim() ?? "";
  if (!webBaseUrl) throw new Error("TENANT_WEB_BASE_URL_REQUIRED");
  const resolver = createTenantAuthRuntimeResolver({
    authBaseUrl: formalConfiguration.publicBaseUrl,
    sessionSecret: formalConfiguration.sessionSigningKey,
    instanceId: process.env.COMPANY_OS_INSTANCE_ID,
    trustedProxyCidrs,
    trustedWebOrigins: allowedWebOrigins,
    source: new PostgresTenantAuthBindingSource(database.db),
    envelope: tenantSecretEnvelope!,
    assertedEmailHmacKey: tenantMasterKeyMaterial!.key,
    ...(identityProvider === "FEISHU" && formalConfiguration.feishuTenantKey ? {
      legacyTenantDigest: `sha256:${createHash("sha256")
        .update(formalConfiguration.feishuTenantKey).digest("hex")}`,
    } : {}),
    createHandler(configuration) {
      return createCompanyAuthWebHandler(createCompanyAuth(database.db, configuration));
    },
  });
  return createTenantAuthNodeHandler({
    authBaseUrl: formalConfiguration.publicBaseUrl,
    webBaseUrl,
    ...resolver,
    legacyHandle: createCompanyAuthWebHandler(auth),
  });
})() : null;
const accessDirectory = database ? createCompanyAccessDirectory(database.db) : null;
const companyAccessStore = database ? createPostgresCompanyAccessStore(database.db) : null;
const companyRestoreStore = database ? new PostgresCompanyRestoreStore(database.db) : null;
const formalEvents = database ? new PostgresEventStore(database.db) : null;
const humanInviteStore = database ? createPostgresHumanInviteStore(database.db) : null;
const tenantInviteIdentity = database && tenantMasterKeyMaterial
  ? new PostgresTenantInviteIdentity(database.db, tenantMasterKeyMaterial.key)
  : null;
const instanceMaintenance = database ? new PostgresInstanceMaintenanceStore(database.db) : null;
const formalExecutionPorts = await loadFormalConnectors(
  parseFormalConnectorPackages(process.env.COMPANY_OS_CONNECTOR_PACKAGES),
);
const formalSecretBroker = await loadFormalSecretBroker(
  parseFormalSecretBrokerPackage(process.env.COMPANY_OS_SECRET_BROKER_PACKAGE),
);
const formalModelProviders = await loadFormalModelProviders(
  parseFormalModelProviderPackages(process.env.COMPANY_OS_MODEL_PROVIDER_PACKAGES),
);
const formalDataConnectors = await loadFormalDataConnectors(
  parseFormalDataConnectorPackages(process.env.COMPANY_OS_DATA_CONNECTOR_PACKAGES),
);
dropRuntimePrivileges();

function secretManagementBroker() {
  if (!formalSecretBroker || typeof formalSecretBroker.beginReferenceManagement !== "function" ||
      typeof formalSecretBroker.referenceManagementResult !== "function") {
    throw new Error("SECRET_BROKER_MANAGEMENT_UNAVAILABLE");
  }
  return formalSecretBroker as typeof formalSecretBroker & SecretBrokerManagementPort;
}
const connectorRuntimeSecurity = new Sha256ConnectorRuntimeSecurity();
const modelRuntimeSecurity = new Sha256ModelRuntimeSecurity();
const contentDigests = new Sha256ContentDigest();

function connectorDelivery(dependencies: {
  readonly structure: EventBackedOrganizationPrincipalStore;
  readonly now: () => string;
}) {
  const delivery = new DeliverConnectorCommands({
    store: formalEvents!,
    structure: dependencies.structure,
    executionPorts: formalExecutionPorts,
    runtimeSecurity: connectorRuntimeSecurity,
    modelProviders: formalModelProviders,
    modelRuntimeSecurity,
    now: dependencies.now,
    nextId: nextPostgresRecordId,
  });
  return {
    async execute(companyId: string) {
      const outcomes = await delivery.execute(companyId);
      runtimeMetrics?.recordConnectorDeliveries(outcomes);
      return outcomes;
    },
  };
}
const companyBootstrap = companyAccessStore ? new CompanyBootstrapService({
  store: companyAccessStore,
  nextId: nextPostgresRecordId,
}) : null;
const tenantSaasCompletion = multiTenantSaasEnabled && database
  ? new CompleteTenantSaasRegistration({
      store: new PostgresTenantSaasCompletionStore(database.db),
      nextId: nextPostgresRecordId,
      now: () => new Date().toISOString(),
    })
  : null;
const tenantSaasRegistration = multiTenantSaasEnabled && database && tenantSecretEnvelope
  ? new BeginTenantSaasRegistration({
      verify: createFeishuIdentityBindingVerifier(),
      store: new PostgresTenantSaasProvisioningStore(database.db),
      envelope: tenantSecretEnvelope,
      nextId: nextPostgresRecordId,
      now: () => new Date().toISOString(),
      reservedExternalTenantDigests: identityProvider === "FEISHU" && formalConfiguration.feishuTenantKey
        ? new Set([`sha256:${createHash("sha256")
          .update(formalConfiguration.feishuTenantKey).digest("hex")}`])
        : new Set(),
    })
  : null;
async function authenticatedHuman(request: import("node:http").IncomingMessage) {
  if (!auth) throw new Error("FORMAL_IDENTITY_REQUIRED");
  const session = await resolveCompanyAuthSession(auth, request);
  if (!session) throw new Error("FORMAL_IDENTITY_REQUIRED");
  return {
    userId: session.user.id,
    sessionId: session.session.id,
    name: session.user.name,
    email: session.user.email,
  };
}

function issueHumanInviteToken(): string {
  return `company_os_invite_${randomBytes(32).toString("base64url")}`;
}

function hashHumanInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
async function formalCompanyContext(request: import("node:http").IncomingMessage, companyId: string) {
  if (!auth || !accessDirectory || !companyAccessStore) throw new Error("FORMAL_IDENTITY_REQUIRED");
  const session = await resolveCompanyAuthSession(auth, request);
  if (!session) throw new Error("FORMAL_IDENTITY_REQUIRED");
  const company = await accessDirectory.getForUser(session.user.id, companyId);
  if (!company) throw new Error("COMPANY_ACCESS_NOT_FOUND");
  const memberships = await companyAccessStore.listActiveHumanMemberships(session.user.id);
  const isInstanceAdmin = await companyAccessStore.isInstanceAdmin(session.user.id);
  const permissionKeys = await companyAccessStore.listPermissionKeys(session.user.id, companyId);
  const now = () => new Date().toISOString();
  return {
    session,
    company,
    now,
    identity: new SessionCompanyIdentityAdapter({
      user: { id: session.user.id, displayName: session.user.name },
      companyId,
      memberships,
      isInstanceAdmin,
      permissionKeys,
      now,
      nextId: nextPostgresRecordId,
    }),
  };
}

async function formalInstanceMaintenance(request: import("node:http").IncomingMessage) {
  if (!auth || !companyAccessStore || !instanceMaintenance) throw new Error("FORMAL_IDENTITY_REQUIRED");
  const session = await resolveCompanyAuthSession(auth, request);
  if (!session) throw new Error("FORMAL_IDENTITY_REQUIRED");
  const now = () => new Date().toISOString();
  return new ManageInstanceMaintenance({
    identity: {
      async getCurrentIdentity() { return { actorId: session.user.id, organizationId: "instance",
        displayName: session.user.name, assurance: "ENTERPRISE_ASSERTED" }; },
      async currentPrincipal() { return { id: session.user.id, kind: "HUMAN", displayName: session.user.name }; },
      async authorize() { throw new Error("INSTANCE_MAINTENANCE_DIRECT_AUTHORIZATION_FORBIDDEN"); },
    },
    access: companyAccessStore, maintenance: instanceMaintenance, now, nextId: nextPostgresRecordId,
  });
}
async function formalAgentBossApi(request: import("node:http").IncomingMessage, companyId: string) {
  if (!formalEvents) throw new Error("FORMAL_API_UNAVAILABLE");
  const context = await formalCompanyContext(request, companyId);
  const organization = new EventBackedOrganizationPrincipalStore(formalEvents);
  const responsibilities = new EventBackedResponsibilityContractStore(formalEvents, nextPostgresRecordId);
  const approvals = new EventBackedApprovalStore(formalEvents, companyId, nextPostgresRecordId, context.now);
  const connectors = new EventBackedConnectorCatalogStore(formalEvents, nextPostgresRecordId);
  const governance = new EventBackedGovernanceCatalogStore(formalEvents, nextPostgresRecordId);
  const toolAccess = new EventBackedToolAccessCatalogStore(formalEvents, nextPostgresRecordId);
  const usageBudget = new EventBackedUsageBudgetStore(formalEvents, nextPostgresRecordId);
  const genericWork = new EventBackedGenericWorkStore(formalEvents, context.now, nextPostgresRecordId);
  const lifecycle = new EventBackedAgentLifecycleStore(formalEvents, nextPostgresRecordId);
  return new FormalAgentBossApi({
    projection: new GetAgentBossProjection({
      identity: context.identity, organization, responsibilities, approvals, events: formalEvents,
      lifecycle, structure: organization,
    }),
    administration: new GetAdministrationProjection({
      identity: context.identity, connectors, governance, events: formalEvents,
      agentRuntimeBindings: new EventBackedAgentRuntimeBindingStore(formalEvents, nextPostgresRecordId),
      executionPorts: formalExecutionPorts, secretBroker: formalSecretBroker,
      modelProviders: formalModelProviders, toolAccess, usageBudget,
      dataConnectors: formalDataConnectors,
      federatedSources: formalFederatedSources,
      retentionPolicyId: configuredRetentionPolicyId,
    }),
    dispatch: new DispatchAccountableWork({
      identity: context.identity,
      organization,
      contracts: responsibilities,
      genericWork,
      events: formalEvents,
      lifecycle,
      structure: organization,
      now: context.now,
      nextId: nextPostgresRecordId,
      maintenance: instanceMaintenance!,
      instanceAccess: companyAccessStore!,
      attemptScheduler: new ScheduleWorkAttempt({
        store: formalEvents,
        executionPorts: formalExecutionPorts,
        runtimeSecurity: connectorRuntimeSecurity,
        nextId: nextPostgresRecordId,
      }),
      modelResolver: new ResolveWorkModelRoute({
        governance,
        providers: formalModelProviders,
        secretBroker: formalSecretBroker,
        runtimeSecurity: modelRuntimeSecurity,
      }),
      budgetAuthorization: new AuthorizeWorkBudget({ store: usageBudget, now: context.now }),
      commandDelivery: connectorDelivery({ structure: organization, now: context.now }),
      executionPreparation: new PrepareWorkExecution({
        events: formalEvents,
        dataAccess: new AccessGovernedData({
          identity: context.identity,
          governance,
          events: formalEvents,
          connectors: formalDataConnectors,
          now: context.now,
          nextId: nextPostgresRecordId,
        }),
        ...(formalSecretBroker ? {
          secretLeases: new IssueSecretLease({
            identity: context.identity,
            broker: formalSecretBroker,
            events: formalEvents,
            now: context.now,
            nextId: nextPostgresRecordId,
          }),
        } : {}),
        now: context.now,
        nextId: nextPostgresRecordId,
      }),
    }),
    approvals: new DecideHighRiskAction({
      identity: context.identity,
      approvals,
      events: formalEvents,
      now: context.now,
      nextId: nextPostgresRecordId,
      attempts: new WorkAttemptService(formalEvents),
    }),
    connectorRegistry: new ConnectorRegistry({ identity: context.identity, store: connectors }),
    governanceRegistry: new GovernanceRegistry({ identity: context.identity, store: governance }),
    responsibilityRegistry: new ResponsibilityRegistry({
      identity: context.identity,
      organization,
      contracts: responsibilities,
      now: context.now,
    }),
    now: context.now,
    agentLifecycle: new ManageAgentLifecycle({
      identity: context.identity,
      structure: organization,
      lifecycle,
      connectors,
      executionPorts: formalExecutionPorts,
      now: context.now,
    }),
  });
}

async function formalPlanningRegistry(
  request: import("node:http").IncomingMessage,
  companyId: string,
): Promise<PlanningRegistry> {
  if (!formalEvents) throw new Error("FORMAL_API_UNAVAILABLE");
  const context = await formalCompanyContext(request, companyId);
  return new PlanningRegistry({
    identity: context.identity,
    structure: new EventBackedOrganizationPrincipalStore(formalEvents),
    store: new EventBackedPlanningStore(formalEvents, nextPostgresRecordId),
    now: context.now,
    nextId: nextPostgresRecordId,
  });
}

async function formalPortfolioApi(
  request: import("node:http").IncomingMessage,
  companyId: string,
): Promise<FormalAgentPortfolioApi> {
  if (!formalEvents) throw new Error("FORMAL_API_UNAVAILABLE");
  const context = await formalCompanyContext(request, companyId);
  return new FormalAgentPortfolioApi({
    identity: context.identity,
    agents: new ManageAgentPortfolio({
      identity: context.identity,
      events: formalEvents,
      nextId: nextPostgresRecordId,
    }),
    work: new RegisterExternalWork({ events: formalEvents, nextId: nextPostgresRecordId }),
    commercial: new ManageAgentCommercialGovernance({
      events: formalEvents,
      nextId: nextPostgresRecordId,
    }),
  });
}
const server = createCompanyOsHttpService({
  runtime,
  ...(publicDemoSessions ? { publicDemoSessions } : {}),
  ...(publicDemoRequestLimiter ? { publicDemoRequestLimiter } : {}),
  deploymentProfile: profile,
  ...(deployedReleaseId ? { releaseId: deployedReleaseId } : {}),
  serviceMode: runtimeMode === "public-demo"
    ? "DEMO_FIXTURE"
    : isFormalConfigured ? "FORMAL" : "LOCAL_DEVELOPMENT",
  deploymentExposure,
  metricsEnabled,
  ...(runtimeMetrics ? { metrics: runtimeMetrics } : {}),
  allowedOrigins: allowedWebOrigins,
  ...(auth ? { authHandler: createCompanyAuthHandler(auth, {
    trustForwardedFor: trustedProxyCidrs.length > 0,
  }) } : {}),
  ...(tenantAuthHandler ? { tenantAuthHandler } : {}),
  ...(tenantSaasCompletion ? {
    tenantOnboarding: {
      async begin(request: import("node:http").IncomingMessage, input: {
        readonly slug: string;
        readonly companyName: string;
        readonly appId: string;
        readonly identityProvider: "FEISHU" | "OIDC" | "CUSTOM_ADAPTER";
        readonly appSecret: string;
        readonly inviteCode?: string;
      }) {
        if (!tenantSaasRegistration || !tenantSignupLimiter) throw new Error("FORMAL_COMMAND_UNAVAILABLE");
        tenantSignupLimiter.consume(tenantSignupClientAddress.resolve(request));
        let signupInviteDigest: `hmac-sha256:${string}` | undefined;
        if (!unrestrictedTenantSignup && !tenantSignupAllowedAppIds.has(input.appId.trim())) {
          if (!tenantSignupInviteGate || !input.inviteCode) throw new Error("TENANT_SIGNUP_NOT_ALLOWED");
          signupInviteDigest = tenantSignupInviteGate.verify(input.inviteCode);
        }
        const registration = await tenantSaasRegistration.begin({
          slug: input.slug,
          companyName: input.companyName,
          appId: input.appId,
          appSecret: input.appSecret,
          ...(signupInviteDigest ? { signupInviteDigest } : {}),
        });
        return {
          ...registration,
          callbackUri: tenantOAuthCallbackUri(formalConfiguration.publicBaseUrl!, registration.providerId),
        };
      },
      async independentHandoff(input: {
        readonly slug: string;
        readonly companyName: string;
        readonly domain: string;
        readonly appId: string;
      }) {
        if (!deployedReleaseId) throw new Error("RELEASE_ID_REQUIRED");
        return generateIndependentDeploymentHandoff({ ...input, releaseId: deployedReleaseId });
      },
      async complete(request: import("node:http").IncomingMessage, registrationId: string,
        input: { readonly locale?: string }) {
        const actor = await authenticatedHuman(request);
        return tenantSaasCompletion.complete({
          registrationId,
          verifiedUserId: actor.userId,
          ...(input.locale ? { locale: input.locale } : {}),
        });
      },
      async completeBySlug(request: import("node:http").IncomingMessage, slug: string,
        input: { readonly locale?: string }) {
        const actor = await authenticatedHuman(request);
        return tenantSaasCompletion.completeBySlug({
          slug,
          verifiedUserId: actor.userId,
          ...(input.locale ? { locale: input.locale } : {}),
        });
      },
    },
  } : {}),
  operationalReadiness: {
    async getStatus() {
      return getOperationalReadiness({
        runtimeMode,
        formalRequired: runtimeMode === "formal" && deploymentExposure === "public",
        formalConfigured: isFormalConfigured,
        database,
        connectors: formalExecutionPorts,
        modelProviders: formalModelProviders,
        secretBroker: formalSecretBroker,
        dataConnectors: formalDataConnectors,
      });
    },
  },
  formalAccess: {
    async getStatus(request) {
      let session = null;
      let identityRuntimeHealthy = true;
      if (auth) {
        try {
          session = await resolveCompanyAuthSession(auth, request);
        } catch {
          identityRuntimeHealthy = false;
        }
      }
      return getFormalAccessStatus({
        deploymentProfile: profile,
        configuration: formalConfiguration,
        authenticated: session !== null,
        identityRuntimeHealthy,
      });
    },
  },
  ...(auth && companyAccessStore && instanceMaintenance ? {
    instanceMaintenance: {
      async get(request) { return (await formalInstanceMaintenance(request)).load(); },
      async change(request, input) {
        return (await formalInstanceMaintenance(request)).execute(input as {
          mode: "OPEN" | "DISPATCH_FROZEN" | "ACCEPTANCE_ONLY";
          expectedRevision: number;
          operationId: string;
          authorizationReference: string;
          acceptance?: {
            planId: string;
            planDigest: `sha256:${string}`;
            work: readonly { companyId: string; workId: string }[];
          };
        });
      },
    },
  } : {}),
  ...(auth && formalEvents && companyAccessStore && accessDirectory ? {
    formalApi: {
      async getAgentBoss(request, companyId) {
        return (await formalAgentBossApi(request, companyId)).getAgentBoss(companyId);
      },
      async getAdministration(request, companyId) {
        return (await formalAgentBossApi(request, companyId)).getAdministration(companyId);
      },
      async listPortfolioAgents(request, companyId) {
        return (await formalPortfolioApi(request, companyId)).listAgents(companyId);
      },
      async synchronizePortfolioAgent(request, companyId, input) {
        return (await formalPortfolioApi(request, companyId)).synchronizeAgent(companyId, input);
      },
      async synchronizeFederatedSource(request, companyId, connectorId) {
        const context = await formalCompanyContext(request, companyId);
        const authorization = await context.identity.authorize({
          companyId,
          action: "portfolio-work:federated-sync",
          resourceId: connectorId,
          reason: "Synchronize one configured federated Agent platform",
        });
        if (authorization.principalId !== context.session.user.id) {
          throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
        }
        const api = await formalPortfolioApi(request, companyId);
        return new SynchronizeFederatedSource({
          sources: formalFederatedSources,
          agents: {
            async synchronize(record) {
              return await api.synchronizeAgent(companyId, record) as {
                readonly status: "RECORDED" | "REPLAYED" | "UPDATED";
              };
            },
          },
          work: {
            async synchronizeFederated(record) {
              return await api.synchronizeFederatedWork(companyId, record) as {
                readonly status: "RECORDED" | "REPLAYED" | "UPDATED";
              };
            },
          },
        }).execute({ companyId, connectorId });
      },
      async listPortfolioWork(request, companyId) {
        return (await formalPortfolioApi(request, companyId)).listExternalWork(companyId);
      },
      async registerObservedWork(request, companyId, input) {
        return (await formalPortfolioApi(request, companyId)).registerObservedWork(companyId, input);
      },
      async synchronizeFederatedWork(request, companyId, input) {
        return (await formalPortfolioApi(request, companyId)).synchronizeFederatedWork(companyId, input);
      },
      async getAgentCommercialState(request, companyId) {
        return (await formalPortfolioApi(request, companyId)).getCommercialState(companyId);
      },
      async synchronizeAgentSubscription(request, companyId, input) {
        return (await formalPortfolioApi(request, companyId)).synchronizeSubscription(companyId, input);
      },
      async recordAgentCredentialStatus(request, companyId, input) {
        return (await formalPortfolioApi(request, companyId)).recordCredentialStatus(companyId, input);
      },
      async importAgentUsage(request, companyId, input) {
        return (await formalPortfolioApi(request, companyId)).importUsage(companyId, input);
      },
      async requestAgentRenewal(request, companyId, input) {
        return (await formalPortfolioApi(request, companyId)).requestRenewal(companyId, input);
      },
      async getAccountabilityLedger(request, companyId) {
        const context = await formalCompanyContext(request, companyId);
        return new GetAccountabilityLedger({ identity: context.identity, events: formalEvents, now: context.now })
          .execute(companyId);
      },
      async exportAccountability(request, companyId, input) {
        const context = await formalCompanyContext(request, companyId);
        return new ExportAccountabilityPackage({
          identity: context.identity,
          events: formalEvents,
          now: context.now,
          nextId: nextPostgresRecordId,
          retentionPolicyId: configuredRetentionPolicyId,
          exportPolicyId: configuredAccountabilityExportPolicyId,
          digests: contentDigests,
        }).execute({ companyId, ...(input as Omit<Parameters<ExportAccountabilityPackage["execute"]>[0], "companyId">) });
      },
      async getPlanning(request, companyId) {
        return (await formalPlanningRegistry(request, companyId)).load(companyId);
      },
      async replacePlanning(request, companyId, input) {
        const command = input as import("../../core/planning.ts").PlanningCatalog & { expectedRevision: number };
        return (await formalPlanningRegistry(request, companyId)).replace(companyId, {
          revision: command.expectedRevision,
          goals: command.goals,
          projects: command.projects,
        }, command.expectedRevision);
      },
      async createGoal(request, companyId, input) {
        return (await formalPlanningRegistry(request, companyId)).createGoal(
          companyId,
          input as import("../../application/planning-registry.ts").CreateGoalInput,
        );
      },
      async updateGoal(request, companyId, goalId, input) {
        return (await formalPlanningRegistry(request, companyId)).updateGoal(
          companyId,
          goalId,
          input as import("../../application/planning-registry.ts").UpdateGoalInput,
        );
      },
      async createProject(request, companyId, input) {
        return (await formalPlanningRegistry(request, companyId)).createProject(
          companyId,
          input as import("../../application/planning-registry.ts").CreateProjectInput,
        );
      },
      async updateProject(request, companyId, projectId, input) {
        return (await formalPlanningRegistry(request, companyId)).updateProject(
          companyId,
          projectId,
          input as import("../../application/planning-registry.ts").UpdateProjectInput,
        );
      },
      async archiveProject(request, companyId, projectId, input) {
        return (await formalPlanningRegistry(request, companyId)).archiveProject(
          companyId,
          projectId,
          (input as { expectedRevision: number }).expectedRevision,
        );
      },
      async dispatchWork(request, companyId, input) {
        return (await formalAgentBossApi(request, companyId)).dispatchWork(companyId, input as never);
      },
      async listWork(request, companyId, input) {
        return (await formalAgentBossApi(request, companyId)).listWork(companyId, input);
      },
      async getWork(request, companyId, workId) {
        return (await formalAgentBossApi(request, companyId)).getWork(companyId, workId);
      },
      async getWorkRunTimeline(request, companyId, workId, attemptId, input) {
        if (!formalEvents) throw new Error("FORMAL_API_UNAVAILABLE");
        const context = await formalCompanyContext(request, companyId);
        return new GetWorkRunTimeline({
          identity: context.identity,
          events: formalEvents,
          attempts: new WorkAttemptService(formalEvents),
        }).execute({ companyId, workId, attemptId, ...input });
      },
      async getCompanyActivity(request, companyId, input) {
        if (!formalEvents) throw new Error("FORMAL_API_UNAVAILABLE");
        const context = await formalCompanyContext(request, companyId);
        return new GetCompanyActivity({ identity: context.identity, events: formalEvents })
          .execute({ companyId, ...input });
      },
      async requestWorkCancellation(request, companyId, workId, attemptId) {
        if (!formalEvents) throw new Error("FORMAL_API_UNAVAILABLE");
        const context = await formalCompanyContext(request, companyId);
        const organization = new EventBackedOrganizationPrincipalStore(formalEvents);
        const delivery = connectorDelivery({ structure: organization, now: context.now });
        return new RequestWorkCancellation({
          identity: context.identity, store: formalEvents, executionPorts: formalExecutionPorts,
          deliver: delivery, now: context.now, nextId: nextPostgresRecordId,
        }).execute({ companyId, workId, attemptId });
      },
      async reconcileWorkAttempt(request, companyId, workId, attemptId, input) {
        if (!formalEvents) throw new Error("FORMAL_API_UNAVAILABLE");
        const context = await formalCompanyContext(request, companyId);
        const command = input as { resolution: import("../../core/work-attempt.ts").UnknownOutcomeResolution; evidenceId: string };
        return new ReconcileWorkAttempt({ identity: context.identity, store: formalEvents,
          now: context.now, nextId: nextPostgresRecordId,
        }).execute({ companyId, workId, attemptId, ...command });
      },
      async retryWorkAttempt(request, companyId, workId, attemptId) {
        if (!formalEvents) throw new Error("FORMAL_API_UNAVAILABLE");
        const context = await formalCompanyContext(request, companyId);
        const organization = new EventBackedOrganizationPrincipalStore(formalEvents);
        const delivery = connectorDelivery({ structure: organization, now: context.now });
        return new RetryWorkAttempt({ identity: context.identity, store: formalEvents, structure: organization,
          lifecycle: new EventBackedAgentLifecycleStore(formalEvents, nextPostgresRecordId),
          responsibilities: new EventBackedResponsibilityContractStore(formalEvents, nextPostgresRecordId),
          governance: new EventBackedGovernanceCatalogStore(formalEvents, nextPostgresRecordId),
          executionPorts: formalExecutionPorts, runtimeSecurity: connectorRuntimeSecurity, deliver: delivery,
          modelResolver: new ResolveWorkModelRoute({
            governance: new EventBackedGovernanceCatalogStore(formalEvents, nextPostgresRecordId),
            providers: formalModelProviders, secretBroker: formalSecretBroker,
            runtimeSecurity: modelRuntimeSecurity,
          }),
          preparation: new PrepareWorkExecution({
            events: formalEvents,
            dataAccess: new AccessGovernedData({ identity: context.identity,
              governance: new EventBackedGovernanceCatalogStore(formalEvents, nextPostgresRecordId),
              events: formalEvents, connectors: formalDataConnectors,
              now: context.now, nextId: nextPostgresRecordId }),
            ...(formalSecretBroker ? { secretLeases: new IssueSecretLease({
              identity: context.identity, broker: formalSecretBroker, events: formalEvents,
              now: context.now, nextId: nextPostgresRecordId,
            }) } : {}),
            now: context.now, nextId: nextPostgresRecordId,
          }),
          now: context.now, nextId: nextPostgresRecordId,
        }).execute({ companyId, workId, attemptId });
      },
      async retryWorkExecutionPreparation(request, companyId, workId, attemptId) {
        if (!formalEvents) throw new Error("FORMAL_API_UNAVAILABLE");
        const context = await formalCompanyContext(request, companyId);
        const organization = new EventBackedOrganizationPrincipalStore(formalEvents);
        const governance = new EventBackedGovernanceCatalogStore(formalEvents, nextPostgresRecordId);
        const preparation = new PrepareWorkExecution({
          events: formalEvents,
          dataAccess: new AccessGovernedData({ identity: context.identity, governance, events: formalEvents,
            connectors: formalDataConnectors, now: context.now, nextId: nextPostgresRecordId }),
          ...(formalSecretBroker ? { secretLeases: new IssueSecretLease({ identity: context.identity,
            broker: formalSecretBroker, events: formalEvents, now: context.now,
            nextId: nextPostgresRecordId }) } : {}),
          now: context.now,
          nextId: nextPostgresRecordId,
        });
        const delivery = connectorDelivery({ structure: organization, now: context.now });
        return new RetryWorkExecutionPreparation({ identity: context.identity, store: formalEvents,
          preparation, delivery }).execute({ companyId, workId, attemptId });
      },
      async decideApproval(request, companyId, requestId, input) {
        return (await formalAgentBossApi(request, companyId)).decideApproval(companyId, requestId, input as never);
      },
      async replaceConnectorCatalog(request, companyId, input) {
        return (await formalAgentBossApi(request, companyId)).replaceConnectorCatalog(companyId, input as never);
      },
      async registerConnectorRuntime(request, companyId, input) {
        const context = await formalCompanyContext(request, companyId);
        return new ManageConnectorRuntimeRegistration({
          identity: context.identity,
          store: new EventBackedConnectorCatalogStore(formalEvents, nextPostgresRecordId),
          executionPorts: formalExecutionPorts,
          now: context.now,
        }).register({ companyId, ...(input as {
          connectorId: string; executionResidency: "MANAGED_CLOUD" | "CUSTOMER_ENVIRONMENT";
          expectedRevision: number;
        }) });
      },
      async setConnectorStatus(request, companyId, connectorId, input) {
        const context = await formalCompanyContext(request, companyId);
        return new ManageConnectorRuntimeRegistration({
          identity: context.identity,
          store: new EventBackedConnectorCatalogStore(formalEvents, nextPostgresRecordId),
          executionPorts: formalExecutionPorts,
          now: context.now,
        }).setStatus({ companyId, connectorId, ...(input as {
          status: "ENABLED" | "DISABLED"; expectedRevision: number;
        }) });
      },
      async replaceGovernanceCatalog(request, companyId, input) {
        return (await formalAgentBossApi(request, companyId)).replaceGovernanceCatalog(companyId, input as never);
      },
      async createDataAuthorizationContract(request, companyId, input) {
        const context = await formalCompanyContext(request, companyId);
        return new ManageDataAuthorizationContract({
          identity: context.identity,
          structure: new EventBackedOrganizationPrincipalStore(formalEvents),
          store: new EventBackedGovernanceCatalogStore(formalEvents, nextPostgresRecordId),
          now: context.now,
        }).create({ companyId, ...(input as Omit<import("../../application/manage-data-authorization-contract.ts").CreateDataAuthorizationContractInput, "companyId">) });
      },
      async setDataAuthorizationStatus(request, companyId, contractId, input) {
        const context = await formalCompanyContext(request, companyId);
        return new ManageDataAuthorizationContract({
          identity: context.identity,
          structure: new EventBackedOrganizationPrincipalStore(formalEvents),
          store: new EventBackedGovernanceCatalogStore(formalEvents, nextPostgresRecordId),
          now: context.now,
        }).setStatus({ companyId, contractId, ...(input as {
          status: "ACTIVE" | "SUSPENDED" | "REVOKED"; expectedRevision: number;
        }) });
      },
      async createModelRoute(request, companyId, input) {
        const context = await formalCompanyContext(request, companyId);
        return new ManageModelRoute({ identity: context.identity,
          store: new EventBackedGovernanceCatalogStore(formalEvents, nextPostgresRecordId),
          providers: formalModelProviders, secretBroker: formalSecretBroker, now: context.now,
        }).create({ companyId, ...(input as Omit<Parameters<ManageModelRoute["create"]>[0], "companyId">) });
      },
      async setModelRouteEnabled(request, companyId, routeId, input) {
        const context = await formalCompanyContext(request, companyId);
        return new ManageModelRoute({ identity: context.identity,
          store: new EventBackedGovernanceCatalogStore(formalEvents, nextPostgresRecordId),
          providers: formalModelProviders, secretBroker: formalSecretBroker, now: context.now,
        }).setEnabled({ companyId, routeId, ...(input as { enabled: boolean; expectedRevision: number }) });
      },
      async createToolProfile(request, companyId, input) {
        const context = await formalCompanyContext(request, companyId);
        return new ManageToolAccess({ identity: context.identity,
          structure: new EventBackedOrganizationPrincipalStore(formalEvents),
          store: new EventBackedToolAccessCatalogStore(formalEvents, nextPostgresRecordId), now: context.now,
        }).createProfile({ companyId, ...(input as Omit<Parameters<ManageToolAccess["createProfile"]>[0], "companyId">) });
      },
      async bindToolProfile(request, companyId, profileId, input) {
        const context = await formalCompanyContext(request, companyId);
        return new ManageToolAccess({ identity: context.identity,
          structure: new EventBackedOrganizationPrincipalStore(formalEvents),
          store: new EventBackedToolAccessCatalogStore(formalEvents, nextPostgresRecordId), now: context.now,
        }).bindProfile({ companyId, profileId, ...(input as Omit<Parameters<ManageToolAccess["bindProfile"]>[0], "companyId" | "profileId">) });
      },
      async createToolPolicy(request, companyId, input) {
        const context = await formalCompanyContext(request, companyId);
        return new ManageToolAccess({ identity: context.identity,
          structure: new EventBackedOrganizationPrincipalStore(formalEvents),
          store: new EventBackedToolAccessCatalogStore(formalEvents, nextPostgresRecordId), now: context.now,
        }).createPolicy({ companyId, ...(input as Omit<Parameters<ManageToolAccess["createPolicy"]>[0], "companyId">) });
      },
      async setToolProfileStatus(request, companyId, profileId, input) {
        const context = await formalCompanyContext(request, companyId);
        return new ManageToolAccess({ identity: context.identity,
          structure: new EventBackedOrganizationPrincipalStore(formalEvents),
          store: new EventBackedToolAccessCatalogStore(formalEvents, nextPostgresRecordId), now: context.now,
        }).setProfileStatus({ companyId, profileId, ...(input as { status: import("../../core/tool-access.ts").ToolProfileStatus;
          expectedRevision: number }) });
      },
      async upsertBudgetPolicy(request, companyId, input) {
        const context = await formalCompanyContext(request, companyId);
        return new ManageUsageBudget({ identity: context.identity,
          structure: new EventBackedOrganizationPrincipalStore(formalEvents),
          store: new EventBackedUsageBudgetStore(formalEvents, nextPostgresRecordId), now: context.now,
        }).upsertPolicy({ companyId, ...(input as Omit<Parameters<ManageUsageBudget["upsertPolicy"]>[0], "companyId">) });
      },
      async replaceResponsibilityContracts(request, companyId, input) {
        return (await formalAgentBossApi(request, companyId)).replaceResponsibilityContracts(companyId, input as never);
      },
      async transitionAgentLifecycle(request, companyId, agentId, input) {
        return (await formalAgentBossApi(request, companyId)).transitionAgentLifecycle(companyId, agentId, input as never);
      },
      async changeAgentRuntimeBinding(request, companyId, agentId, input) {
        const context = await formalCompanyContext(request, companyId);
        return new ManageAgentRuntimeBinding({
          identity: context.identity,
          events: formalEvents,
          structure: new EventBackedOrganizationPrincipalStore(formalEvents),
          lifecycle: new EventBackedAgentLifecycleStore(formalEvents, nextPostgresRecordId),
          connectors: new EventBackedConnectorCatalogStore(formalEvents, nextPostgresRecordId),
          responsibilities: new EventBackedResponsibilityContractStore(formalEvents, nextPostgresRecordId),
          bindings: new EventBackedAgentRuntimeBindingStore(formalEvents, nextPostgresRecordId),
          executionPorts: formalExecutionPorts,
          runtimeSecurity: connectorRuntimeSecurity,
          now: context.now,
        }).execute({ companyId, agentId, ...(input as {
          operation: "BIND" | "UNBIND"; connectorId: string | null;
          expectedRevision: number; reason: string;
        }) });
      },
      async transferResponsibility(request, companyId, agentId, input) {
        const context = await formalCompanyContext(request, companyId);
        return new TransferAgentResponsibility({ identity: context.identity, events: formalEvents,
          now: context.now, nextId: nextPostgresRecordId }).execute({ companyId, agentId,
          ...(input as Omit<import("../../application/revise-company-organization.ts").TransferAgentResponsibilityInput,
            "companyId" | "agentId">) });
      },
      async exportCompany(request, companyId) {
        const context = await formalCompanyContext(request, companyId);
        const receipt = await context.identity.authorize({
          companyId, action: "company-portability:export", resourceId: companyId,
          reason: "Export a versioned Company OS backup",
        });
        if (receipt.principalId !== context.session.user.id) {
          throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
        }
        return { schemaVersion: 1, backup: JSON.parse(await formalEvents.exportBackup(companyId)) };
      },
      async beginSecretReferenceManagement(request, companyId, input) {
        const context = await formalCompanyContext(request, companyId);
        return new ManageSecretReference({ identity: context.identity, broker: secretManagementBroker(),
          events: formalEvents, now: context.now, nextId: nextPostgresRecordId,
        }).begin({ companyId, ...(input as Omit<import("../../core/secret-governance.ts").SecretReferenceManagementIntent, "companyId">) });
      },
      async confirmSecretReferenceManagement(request, companyId, sessionId) {
        const context = await formalCompanyContext(request, companyId);
        return new ManageSecretReference({ identity: context.identity, broker: secretManagementBroker(),
          events: formalEvents, now: context.now, nextId: nextPostgresRecordId,
        }).confirm(companyId, sessionId);
      },
    },
  } : {}),
  ...(auth && accessDirectory && companyBootstrap && companyRestoreStore && formalEvents && humanInviteStore ? {
    formalDirectory: {
      async listCompanies(request) {
        const actor = await authenticatedHuman(request);
        return multiTenantSaasEnabled
          ? accessDirectory.listRoutableForUser(actor.userId)
          : accessDirectory.listForUser(actor.userId);
      },
      async claimFirstAdmin(request) {
        const result = await companyBootstrap.claimFirstInstanceAdmin(await authenticatedHuman(request));
        if (result.status === "ALREADY_CLAIMED") throw new Error("FIRST_ADMIN_ALREADY_CLAIMED");
        return { claimed: true, userId: result.userId };
      },
      async createCompany(request, input) {
        return companyBootstrap.createOwnedCompany(
          await authenticatedHuman(request),
          input as { name: string; purpose: string; locale: string },
        );
      },
      async restoreCompany(request, input) {
        const backup = (input as { readonly backup: unknown }).backup;
        return new RestoreCompanyFromBackup({ store: companyRestoreStore,
          nextId: nextPostgresRecordId }).execute(await authenticatedHuman(request), JSON.stringify(backup));
      },
      async inspectCompanyRestore(request, input) {
        const backup = (input as { readonly backup: unknown }).backup;
        return new RestoreCompanyFromBackup({ store: companyRestoreStore,
          nextId: nextPostgresRecordId }).inspect(await authenticatedHuman(request), JSON.stringify(backup));
      },
      async setupOrganization(request, companyId, input) {
        const context = await formalCompanyContext(request, companyId);
        const registry = new CompanyRegistry({
          identity: context.identity,
          events: formalEvents,
          now: context.now,
          nextId: nextPostgresRecordId,
        });
        const setup = new SetupInitialOrganization({ registry, nextId: nextPostgresRecordId });
        const command = input as { departmentName: string; ownerTitle: string };
        return setup.execute({
          company: {
            id: context.company.id,
            name: context.company.name,
            purpose: context.company.purpose,
            locale: context.company.locale,
          },
          owner: {
            id: context.session.user.id,
            name: context.session.user.name,
            title: command.ownerTitle,
          },
          departmentName: command.departmentName,
        });
      },
      async reviseOrganization(request, companyId, input) {
        const context = await formalCompanyContext(request, companyId);
        return new ReviseCompanyOrganization({
          identity: context.identity,
          events: formalEvents,
          now: context.now,
          nextId: nextPostgresRecordId,
        }).execute({
          companyId,
          organization: (input as { organization: import("../../core/organization.ts").OrganizationDraft }).organization,
        });
      },
      async updateCompanyProfile(request, companyId, input) {
        const context = await formalCompanyContext(request, companyId);
        return new UpdateCompanyProfile({ identity: context.identity, events: formalEvents,
          profileStore: companyAccessStore!,
          now: context.now, nextId: nextPostgresRecordId }).execute({
          companyId,
          ...(input as Omit<import("../../application/revise-company-organization.ts").UpdateCompanyProfileInput,
            "companyId">),
        });
      },
      async archiveCompany(request, companyId, input) {
        const context = await formalCompanyContext(request, companyId);
        return new ArchiveCompany({ identity: context.identity, events: formalEvents,
          portability: formalEvents, lifecycle: companyAccessStore!,
          now: context.now, nextId: nextPostgresRecordId,
          retentionPolicyId: configuredRetentionPolicyId }).execute({ companyId,
          ...(input as Omit<import("../../application/archive-company.ts").ArchiveCompanyInput, "companyId">),
        });
      },
      async archiveDepartment(request, companyId, departmentId, input) {
        const context = await formalCompanyContext(request, companyId);
        return new ArchiveDepartment({ identity: context.identity, events: formalEvents,
          now: context.now, nextId: nextPostgresRecordId }).execute({ companyId, departmentId,
          ...(input as Omit<import("../../application/revise-company-organization.ts").ArchiveDepartmentInput,
            "companyId" | "departmentId">) });
      },
      async createHumanInvite(request, companyId, input) {
        const context = await formalCompanyContext(request, companyId);
        const command = input as {
          email: string;
          departmentId: string;
          title: string;
          role: "owner" | "admin" | "operator" | "viewer";
        };
        const result = await new CreateHumanInvite({
          identity: context.identity,
          events: formalEvents,
          store: humanInviteStore,
          now: context.now,
          nextId: nextPostgresRecordId,
          issueToken: issueHumanInviteToken,
          hashToken: hashHumanInviteToken,
          ...(tenantInviteIdentity ? {
            assertedEmailHmac: (targetCompanyId: string, email: string) =>
              tenantInviteIdentity.expectedEmailHmac(targetCompanyId, email),
          } : {}),
        }).execute({ companyId, ...command });
        return {
          inviteId: result.invite.id,
          expiresAt: result.invite.expiresAt,
          invitePath: `/invite/${result.token}`,
          token: result.token,
        };
      },
      async listHumanMembers(request, companyId) {
        const context = await formalCompanyContext(request, companyId);
        await context.identity.authorize({
          companyId,
          action: "company-members:read",
          resourceId: companyId,
          reason: "List the human members of this company",
        });
        return {
          schemaVersion: 1,
          members: await companyAccessStore!.listCompanyHumanMembers(companyId),
        };
      },
      async updateHumanMember(request, companyId, userId, input) {
        const context = await formalCompanyContext(request, companyId);
        return new ManageCompanyMembers({
          identity: context.identity,
          events: formalEvents,
          store: companyAccessStore!,
          now: context.now,
          nextId: nextPostgresRecordId,
        }).update({
          companyId,
          userId,
          ...(input as {
            expectedRole: "owner" | "admin" | "operator" | "viewer";
            expectedStatus: "pending" | "active" | "suspended" | "archived";
            role: "owner" | "admin" | "operator" | "viewer";
            status: "active" | "suspended";
          }),
        });
      },
      async acceptHumanInvite(request, token) {
        const actor = await authenticatedHuman(request);
        const invite = await new AcceptHumanInvite({
          events: formalEvents,
          store: humanInviteStore,
          now: () => new Date().toISOString(),
          nextId: nextPostgresRecordId,
          hashToken: hashHumanInviteToken,
        }).execute({
          token,
          user: {
            id: actor.userId,
            name: actor.name,
            email: actor.email,
            ...(tenantInviteIdentity ? {
              assertedEmailHmac: await tenantInviteIdentity.assertedEmailHmac(actor.userId),
            } : {}),
          },
        });
        return {
          accepted: true,
          companyId: invite.companyId,
          membershipRole: invite.membershipRole,
        };
      },
    },
  } : {}),
});

const stopConnectorSupervisor = formalEvents && companyAccessStore
  ? startConnectorCommandSupervisor(new RedriveConnectorCommands({
      listCompanyIds: () => companyAccessStore.listCompanyIds(),
      deliver: async (companyId) => {
        const collectObservations = () => new CollectConnectorObservations({
          store: formalEvents,
          executionPorts: formalExecutionPorts,
          approvals: new EventBackedApprovalStore(formalEvents, companyId, nextPostgresRecordId, () => new Date().toISOString()),
          usageIngestion: new IngestConnectorUsage({
            store: new EventBackedUsageBudgetStore(formalEvents, nextPostgresRecordId),
            nextId: nextPostgresRecordId,
          }),
          riskObservation: new ProcessOperationalRiskObservation({
            events: formalEvents,
            executionPorts: formalExecutionPorts,
            nextId: nextPostgresRecordId,
          }),
          riskRules: [],
          nextId: nextPostgresRecordId,
        }).execute(companyId);
        const deliver = () => connectorDelivery({
          structure: new EventBackedOrganizationPrincipalStore(formalEvents),
          now: () => new Date().toISOString(),
        }).execute(companyId);
        return new ReconcileConnectorControlPlane({
          recoverExpired: async () => {
            await new RecoverExpiredWorkAttempts({
              store: formalEvents,
              now: () => new Date().toISOString(),
              nextId: nextPostgresRecordId,
            }).execute(companyId);
          },
          deliver,
          collectObservations: async () => { await collectObservations(); },
          ...(formalSecretBroker ? {
            revokeSecretLeases: async () => {
              const revocations = await new RevokeAttemptSecretLeases({ events: formalEvents, broker: formalSecretBroker,
                now: () => new Date().toISOString(), nextId: nextPostgresRecordId }).execute(companyId);
              runtimeMetrics?.recordSecretLeaseRevocations(revocations);
            },
          } : {}),
        }).execute();
      },
    }), {
      intervalMs: Math.max(10_000, Number(process.env.COMPANY_OS_CONNECTOR_REDRIVE_INTERVAL_MS) || 30_000),
      onError: () => process.stderr.write(operationalLogLine({
        event: "company_os.connector_redrive_failed", level: "ERROR", code: "CONNECTOR_REDRIVE_FAILED",
      })),
    })
  : () => {};

server.listen(listenPort, host, () => {
  process.stdout.write(operationalLogLine({ event: "company_os.started", level: "INFO",
    deploymentProfile: profile, exposure: deploymentExposure, port: listenPort }));
});

function shutdown(signal: "SIGINT" | "SIGTERM") {
  stopConnectorSupervisor();
  server.close(async () => {
    await database?.close();
    process.stdout.write(operationalLogLine({ event: "company_os.stopped", level: "INFO", signal }));
    process.exitCode = 0;
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
