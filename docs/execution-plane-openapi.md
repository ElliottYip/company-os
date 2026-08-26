# Execution-plane OpenAPI contracts

Status: protocol `1.0`, machine-readable contracts admitted to the release gate.

Company OS publishes three control-plane OpenAPI 3.1 specifications and one
execution-only Secret redemption specification for the customer-owned
execution plane:

| Boundary | Package artifact | Required protocol header |
|---|---|---|
| Agent execution | `connectors/http-agent-node/openapi.json` | `x-company-os-connector-protocol: 1.0` |
| Governed data | `connectors/http-data-node/openapi.json` | `x-company-os-data-connector-protocol: 1.0` |
| Secret management | `brokers/http-secret-broker/openapi.json` | `x-company-os-secret-broker-protocol: 1.0` |
| Secret redemption (execution only) | `brokers/vault-secret-broker/redemption-openapi.json` | Separate execution bearer authority |

Each package exports its specification through the `./openapi` subpath. FDEs
may use these artifacts to generate server stubs or compatibility clients, but
the installed Company OS clients remain the conformance authority for request
size, TLS, redirect, timeout, ordering, idempotency and secret-free payload
checks that OpenAPI cannot express completely.

The repository also contains `connectors/http-data-node-reference`, a
fixture-only server used for deterministic staging acceptance. It is not an
enterprise data connector. Its separately attested image can be replaced by a
customer-owned implementation without changing the Data Connector client or
Company OS inward layers.

The redemption contract is intentionally separate from the browser/control
contract. It returns ephemeral material and therefore must be reachable only
from an execution node. The Company OS API and Web must never possess its
bearer authority. The maintained Vault adapter currently supports one shared
execution credential for a single staging Agent Node; per-node identity or
mTLS-scoped redemption is required before a multi-node production claim.

The neutral Secret management contract returns only a same-origin handoff URL
and public metadata. The maintained Vault adapter implements the two management
API routes in `brokers/http-secret-broker/openapi.json`; credential submission
occurs on a short-lived Broker-owned HTML form and is deliberately not an
OpenAPI field. This prevents generated Company OS clients from acquiring a
credential-material method by accident.

The contracts define every maintained `/v1` route, exact request/response
shapes, bounded identifiers, digests, timestamps, stable structured errors,
Bearer authentication and protocol-version headers. Enterprise record content,
credential material, external sessions and private reasoning are not protocol
fields.

Agent-node Work submissions use a typed `WorkExecutionInput`. When Company OS
governs model selection, `modelBinding` carries the frozen policy, route,
provider, model, data classification and residency plus the exact opaque
`executionGrantReference`. It never carries the provider credential reference,
credential version, key material, prompt content, vendor session or private
reasoning. The execution node may pass that opaque grant only to the named
provider boundary for the bound Work Attempt.

Agent observations may include bounded `usageOutputs`. Each usage reference
must also be an evidence output with a SHA-256 digest. The node reports biller,
billing type, price status, token counts, cents and occurrence time; Company OS
derives provider, model, company, Agent and Work from the frozen Attempt rather
than trusting node-authored authority fields. `unpriced` usage carries zero
cents, and a replayed usage reference must be byte-equivalent.

Run:

```sh
npm run check:protocols
```

The generator is `scripts/generate-execution-plane-openapi.mjs`. To intentionally
change protocol `1.0`, first change the neutral port/client behavior and tests,
then run the generator with `--write`, inspect the semantic diff, and run the
full compatibility suite. The route-inventory test rejects undocumented client
routes. Breaking request or response changes require a new protocol version;
silently changing the `1.0` schema is forbidden.

These specifications contain no customer URL or credential. A customer inserts
its own HTTPS server coordinate at deployment time and retains authentication
material in its deployment secret manager.
