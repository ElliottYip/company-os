import type { Identifier } from "../core/control-plane.ts";
import type { DataClassification } from "../core/data-governance.ts";
import type { ModelResidency, ModelRoute } from "../core/model-governance.ts";
import { validateGovernanceCatalog } from "../core/governance-catalog.ts";
import type { GovernanceCatalogPort, GovernanceCatalogSnapshot } from "../ports/governance-catalog-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import type { ModelProviderRuntimePort } from "../ports/model-provider-runtime-port.ts";
import type { SecretBrokerRuntimePort } from "../ports/secret-broker-runtime-port.ts";

interface Dependencies {
  readonly identity: IdentityPort;
  readonly store: GovernanceCatalogPort;
  readonly providers: readonly ModelProviderRuntimePort[];
  readonly secretBroker: SecretBrokerRuntimePort | null;
  readonly now: () => string;
}

export class ManageModelRoute {
  readonly #dependencies: Dependencies;
  constructor(dependencies: Dependencies) { this.#dependencies = dependencies; }

  async create(input: {
    readonly companyId: Identifier;
    readonly policyId: Identifier;
    readonly routeId: Identifier;
    readonly providerAdapterId: Identifier;
    readonly modelReference: Identifier;
    readonly credentialReference: Identifier;
    readonly allowedDataClassifications: readonly DataClassification[];
    readonly residency: ModelResidency;
    readonly expectedRevision: number;
  }): Promise<GovernanceCatalogSnapshot> {
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw new Error("MODEL_ROUTE_INPUT_INVALID");
    }
    const identity = await this.#identity(input.companyId);
    const snapshot = await this.#dependencies.store.load(input.companyId);
    if (snapshot.revision !== input.expectedRevision) throw new Error("GOVERNANCE_CATALOG_REVISION_CONFLICT");
    if (snapshot.modelRoutingPolicies.some(({ routes }) => routes.some(({ id }) => id === input.routeId))) {
      throw new Error("MODEL_ROUTE_ALREADY_EXISTS");
    }
    await this.#validateBindings(input);
    const route: ModelRoute = {
      id: input.routeId,
      providerAdapterId: input.providerAdapterId,
      modelReference: input.modelReference,
      credentialReference: input.credentialReference,
      allowedDataClassifications: [...input.allowedDataClassifications],
      residency: input.residency,
      enabled: false,
    };
    const existingPolicy = snapshot.modelRoutingPolicies.find(({ id }) => id === input.policyId);
    const policies = existingPolicy
      ? snapshot.modelRoutingPolicies.map((policy) => policy.id === input.policyId
        ? { ...policy, routes: [...policy.routes, route] } : policy)
      : [...snapshot.modelRoutingPolicies, { id: input.policyId, companyId: input.companyId, routes: [route] }];
    const catalog = validateGovernanceCatalog({ companyId: input.companyId,
      modelRoutingPolicies: policies, dataAuthorizationContracts: snapshot.dataAuthorizationContracts });
    await this.#authorize(identity.actorId, input.companyId, "model-route:create", input.routeId);
    return this.#dependencies.store.replace({ ...catalog, actorId: identity.actorId,
      expectedRevision: input.expectedRevision, recordedAt: this.#dependencies.now() });
  }

  async setEnabled(input: {
    readonly companyId: Identifier;
    readonly routeId: Identifier;
    readonly enabled: boolean;
    readonly expectedRevision: number;
  }): Promise<GovernanceCatalogSnapshot> {
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 ||
        typeof input.enabled !== "boolean") throw new Error("MODEL_ROUTE_STATUS_INPUT_INVALID");
    const identity = await this.#identity(input.companyId);
    const snapshot = await this.#dependencies.store.load(input.companyId);
    if (snapshot.revision !== input.expectedRevision) throw new Error("GOVERNANCE_CATALOG_REVISION_CONFLICT");
    const route = snapshot.modelRoutingPolicies.flatMap(({ routes }) => routes)
      .find(({ id }) => id === input.routeId);
    if (!route) throw new Error("MODEL_ROUTE_NOT_FOUND");
    if (route.enabled === input.enabled) return snapshot;
    if (input.enabled) {
      await this.#validateBindings({ companyId: input.companyId, ...route });
      const provider = await this.#provider(route.providerAdapterId);
      if (await provider.health() === "UNAVAILABLE" || !this.#dependencies.secretBroker ||
          await this.#dependencies.secretBroker.health() === "UNAVAILABLE") {
        throw new Error("MODEL_ROUTE_RUNTIME_UNAVAILABLE");
      }
    }
    await this.#authorize(identity.actorId, input.companyId, "model-route:update", input.routeId);
    return this.#dependencies.store.replace({
      companyId: input.companyId,
      modelRoutingPolicies: snapshot.modelRoutingPolicies.map((policy) => ({
        ...policy, routes: policy.routes.map((candidate) => candidate.id === input.routeId
          ? { ...candidate, enabled: input.enabled } : candidate),
      })),
      dataAuthorizationContracts: snapshot.dataAuthorizationContracts,
      actorId: identity.actorId,
      expectedRevision: input.expectedRevision,
      recordedAt: this.#dependencies.now(),
    });
  }

  async #validateBindings(input: {
    readonly companyId: Identifier; readonly providerAdapterId: Identifier;
    readonly modelReference: Identifier; readonly credentialReference: Identifier;
    readonly residency: ModelResidency;
  }) {
    const provider = await this.#provider(input.providerAdapterId);
    const capabilities = await provider.capabilities();
    if (!capabilities.modelReferences.includes(input.modelReference) ||
        !capabilities.supportedResidencies.includes(input.residency)) {
      throw new Error("MODEL_ROUTE_CAPABILITY_MISMATCH");
    }
    if (!this.#dependencies.secretBroker) throw new Error("SECRET_BROKER_NOT_INSTALLED");
    const brokerCapabilities = await this.#dependencies.secretBroker.capabilities();
    if (!brokerCapabilities.supportedPurposes.includes("MODEL_PROVIDER")) {
      throw new Error("SECRET_BROKER_PURPOSE_UNSUPPORTED");
    }
    const secret = await this.#dependencies.secretBroker.describe(input.companyId, input.credentialReference);
    if (!secret) throw new Error("SECRET_REFERENCE_NOT_FOUND");
    if (secret.companyId !== input.companyId) throw new Error("TENANT_MISMATCH");
    if (secret.purpose !== "MODEL_PROVIDER" || secret.providerAdapterId !== input.providerAdapterId) {
      throw new Error("MODEL_ROUTE_SECRET_BINDING_INVALID");
    }
    if (secret.status !== "ACTIVE") throw new Error("SECRET_REFERENCE_INACTIVE");
  }

  async #provider(providerAdapterId: Identifier) {
    for (const provider of this.#dependencies.providers) {
      if ((await provider.capabilities()).providerAdapterId === providerAdapterId) return provider;
    }
    throw new Error("MODEL_PROVIDER_NOT_INSTALLED");
  }

  async #identity(companyId: Identifier) {
    const identity = await this.#dependencies.identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== companyId) throw new Error("TENANT_MISMATCH");
    return identity;
  }

  async #authorize(actorId: Identifier, companyId: Identifier, action: string, resourceId: Identifier) {
    const receipt = await this.#dependencies.identity.authorize({ companyId, action, resourceId,
      reason: `${action} installed provider route` });
    if (receipt.principalId !== actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
  }
}
