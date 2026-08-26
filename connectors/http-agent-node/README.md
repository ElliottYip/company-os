# Company OS HTTP Agent Node Connector

This independently installable Connector adapts a customer-operated HTTP Agent
node to the vendor-neutral Company OS `AgentExecutionPort` protocol. It is not
an Agent and does not include a model, fixture identity, or production data.

The control plane sends only bounded Work references and a short-lived,
secret-free runtime proof. Authentication is injected into the server process
through `COMPANY_OS_HTTP_AGENT_NODE_BEARER_TOKEN` and is carried only in the
HTTP `Authorization` header. It is never returned to Company OS events or Web
projections.

Required production environment:

- `COMPANY_OS_HTTP_AGENT_NODE_BASE_URL` — HTTPS origin only.
- `COMPANY_OS_HTTP_AGENT_NODE_BEARER_TOKEN` — deployment-injected bearer token.

Optional settings include `COMPANY_OS_HTTP_AGENT_NODE_ID`,
`COMPANY_OS_HTTP_AGENT_NODE_NAME`, and
`COMPANY_OS_HTTP_AGENT_NODE_TIMEOUT_MS`. The Connector may declare an exact
bounded Work deadline through
`COMPANY_OS_HTTP_AGENT_NODE_MAXIMUM_TIMEOUT_SECONDS` (1–86,400 seconds; default
86,400). This value becomes part of the frozen capability authority for each
Attempt and is not a client-side request timeout. Plain HTTP can be enabled only for an
explicit loopback test node with
`COMPANY_OS_HTTP_AGENT_NODE_ALLOW_INSECURE_LOOPBACK=true`.

The node implements `/v1/health`, `/v1/deployments`, `/v1/work`,
`/v1/work/{workId}/observations`, and `/v1/work/{workId}/commands`. Responses
are JSON, bounded to 1 MiB, do not redirect, and must use stable, ordered,
provider-neutral observations.

For a Company OS-governed model route, the Work input includes a secret-free
`modelBinding` and its exact opaque Broker `executionGrantReference`. The node
must not infer grant ownership from array order and must not accept provider
credentials or private vendor sessions in the Work payload.
The Agent Node is the sole inference owner: it redeems the grant at the named
provider boundary and owns provider idempotency/session behavior. The Company
OS model-provider package is capability/health metadata only and never invokes
inference.

Ordered observations may report `usageOutputs`. Every usage reference must have
a matching evidence output digest. Provider/model/Work/Agent identity is not a
usage field because Company OS derives it from the frozen Attempt. Counts and
cents are non-negative integers; `unpriced` usage must report zero cents.

The package ships the complete OpenAPI 3.1 contract as `openapi.json` and
exports it at `@company-os/http-agent-node-connector/openapi`. The repository
verification gate rejects a generated specification that has drifted from the
client route inventory.
