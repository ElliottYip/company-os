import {
  selectModelRoute,
  type ModelExecutionAuthority,
  type ModelRoutingIntent,
} from "../core/model-governance.ts";
import type { GovernanceCatalogPort } from "../ports/governance-catalog-port.ts";
import type { ModelProviderRuntimePort } from "../ports/model-provider-runtime-port.ts";
import type { ModelRuntimeSecurityPort } from "../ports/model-runtime-security-port.ts";
import type { SecretBrokerRuntimePort } from "../ports/secret-broker-runtime-port.ts";

const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/;

/** Resolves mutable governance/runtime state into one immutable Attempt authority. */
export class ResolveWorkModelRoute {
  readonly #governance: GovernanceCatalogPort;
  readonly #providers: readonly ModelProviderRuntimePort[];
  readonly #secretBroker: SecretBrokerRuntimePort | null;
  readonly #runtimeSecurity: ModelRuntimeSecurityPort;

  constructor(dependencies: {
    readonly governance: GovernanceCatalogPort;
    readonly providers: readonly ModelProviderRuntimePort[];
    readonly secretBroker: SecretBrokerRuntimePort | null;
    readonly runtimeSecurity: ModelRuntimeSecurityPort;
  }) {
    this.#governance = dependencies.governance;
    this.#providers = dependencies.providers;
    this.#secretBroker = dependencies.secretBroker;
    this.#runtimeSecurity = dependencies.runtimeSecurity;
  }

  async execute(intent: ModelRoutingIntent): Promise<ModelExecutionAuthority> {
    const catalog = await this.#governance.load(intent.companyId);
    const policy = catalog.modelRoutingPolicies.find(({ id }) => id === intent.policyId);
    if (!policy) throw new Error("MODEL_ROUTING_POLICY_NOT_FOUND");
    const decision = selectModelRoute(policy, intent);
    if (decision.type === "DENIED") throw new Error(decision.policyCode);

    const contexts = await Promise.all(this.#providers.map(async (provider) => ({
      provider,
      capabilities: await provider.capabilities(),
      health: await provider.health(),
    })));
    const context = contexts.find(({ capabilities }) =>
      capabilities.providerAdapterId === decision.route.providerAdapterId);
    if (!context) throw new Error("MODEL_PROVIDER_NOT_INSTALLED");
    if (context.health === "UNAVAILABLE") throw new Error("MODEL_PROVIDER_UNAVAILABLE");
    if (!context.capabilities.modelReferences.includes(decision.route.modelReference) ||
        !context.capabilities.supportedResidencies.includes(decision.route.residency)) {
      throw new Error("MODEL_ROUTE_CAPABILITY_MISMATCH");
    }

    const broker = this.#secretBroker;
    if (!broker) throw new Error("SECRET_BROKER_NOT_INSTALLED");
    const [brokerCapabilities, brokerHealth] = await Promise.all([
      broker.capabilities(), broker.health(),
    ]);
    if (brokerHealth === "UNAVAILABLE") throw new Error("SECRET_BROKER_UNAVAILABLE");
    if (!brokerCapabilities.supportedPurposes.includes("MODEL_PROVIDER")) {
      throw new Error("SECRET_BROKER_PURPOSE_UNSUPPORTED");
    }
    const reference = await broker.describe(intent.companyId, decision.route.credentialReference);
    if (!reference) throw new Error("SECRET_REFERENCE_NOT_FOUND");
    if (reference.companyId !== intent.companyId) throw new Error("TENANT_MISMATCH");
    if (reference.purpose !== "MODEL_PROVIDER" ||
        reference.providerAdapterId !== decision.route.providerAdapterId) {
      throw new Error("MODEL_ROUTE_SECRET_BINDING_INVALID");
    }
    if (reference.status !== "ACTIVE") throw new Error("SECRET_REFERENCE_INACTIVE");
    const digest = await this.#runtimeSecurity.digestCapabilities(context.capabilities);
    if (!SHA256_DIGEST.test(digest)) throw new Error("MODEL_PROVIDER_CAPABILITY_DIGEST_INVALID");

    return {
      policyId: policy.id,
      routeId: decision.route.id,
      providerAdapterId: decision.route.providerAdapterId,
      modelReference: decision.route.modelReference,
      classification: intent.classification,
      residency: decision.route.residency,
      credentialReferenceId: reference.id,
      credentialVersion: reference.currentVersion,
      providerCapabilityDigest: digest,
    };
  }
}
