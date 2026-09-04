# HTTP Agent Node Connector runbook

Status: implemented client and maintained reference-server packages; a real
customer Agent driver compatibility run is still required.

The shared read-only customer preflight and the separate staging execution
checklist are defined in `docs/customer-boundary-acceptance.md`.

`@company-os/http-agent-node-connector` is a stateless, independently
installable adapter between Company OS and a customer-operated execution node.
It is not a model, Agent, or Demo runtime. Raft Agent, Codex, DeepSeek, and
enterprise runtimes may implement the same node protocol without receiving a
privileged position in Company OS core.

## Production configuration

Install the package with the Company OS service and configure:

```text
COMPANY_OS_CONNECTOR_PACKAGES=@company-os/http-agent-node-connector
COMPANY_OS_HTTP_AGENT_NODE_BASE_URL=https://agent-node.example.com
COMPANY_OS_HTTP_AGENT_NODE_BEARER_TOKEN=<injected by deployment secret manager>
```

Optional variables are `COMPANY_OS_HTTP_AGENT_NODE_ID`,
`COMPANY_OS_HTTP_AGENT_NODE_NAME`, and
`COMPANY_OS_HTTP_AGENT_NODE_TIMEOUT_MS` (250–60,000 milliseconds). The bearer
token is process configuration, not Company OS event data. Do not put it in a
company catalog, database row, browser request, log field, or support bundle.

Plain HTTP is rejected. The
`COMPANY_OS_HTTP_AGENT_NODE_ALLOW_INSECURE_LOOPBACK=true` override accepts only
`localhost`, `127.0.0.1`, or `::1` and exists solely for isolated tests.

Before restarting the formal service, run `npm run agent:preflight`. The
command checks the installed package selection, authentication source, Codex
CLI version and authenticated Agent Node health. Its JSON result contains
stable PASS/BLOCKED codes and sanitized capability metadata only; it never
prints the configured base URL or bearer value. A READY preflight does not
register the runtime in a company and is not customer or production
acceptance.

The direct HTTP transport is initiated by Company OS. It therefore works only
when the Agent Node is reachable from the API service, including self-hosted
loopback and approved private-network deployments. It does not connect a
laptop's `localhost` to a hosted control plane through the browser.

## Node API v1

Every request carries:

```text
Authorization: Bearer <deployment-injected value>
X-Company-OS-Connector-Protocol: 1.0
Accept: application/json
Content-Type: application/json
```

The node exposes:

- `GET /v1/health`
- `POST /v1/deployments`
- `POST /v1/work`
- `GET /v1/work/{workId}/observations`
- `POST /v1/work/{workId}/commands`

Deploy and submit operations must be idempotent. A repeated Work idempotency
key returns the same execution, never a second side effect. Observations are
ordered by a contiguous positive sequence and retain the original authored
summary. Evidence outputs contain opaque references plus SHA-256 digests;
successful completion also identifies a distinct result reference.

Commands use `PAUSE`, `RESUME`, or `CANCEL`. Resume carries the exact approval
request ID. Cancellation acknowledgement means only that the node accepted the
command; Company OS does not mark a running Attempt terminal until a matching
`CANCELLED` observation arrives.

## Security and failure boundary

- The base URL cannot contain user information, query parameters, fragments,
  or a path prefix.
- Redirects are disabled, preventing an approved origin from forwarding
  authorization to another host.
- JSON requests are bounded to 256 KiB and responses to 1 MiB.
- Credential-, Secret-, token-, external-session-, and private-reasoning-shaped
  fields are rejected before transmission and on observation ingestion.
- Remote response text is never used as a control-plane error contract.
- Authentication, conflict, rate-limit, unavailable, protocol, and payload
  failures map to stable `HTTP_AGENT_NODE_*` codes.
- Company OS freezes the Connector capability digest in every Attempt and
  refuses delivery after capability drift.

TLS termination, certificate trust, bearer-token issuance/rotation, egress
allow-listing, node availability and node-side execution isolation remain
deployment responsibilities. Token rotation should overlap old and new values
at the node, restart the Company OS service with the new injected value, verify
health, then revoke the old value. No database migration is involved.

## Current admission evidence

Focused tests start an explicitly synthetic loopback node, run the complete
Connector conformance sequence, load the adapter through its installed npm
package name, and reconstruct both the control-plane Store and Connector
instance after submission. The reconstructed process observes ordered progress,
admits evidence digests and the result reference, and completes the original
Attempt without a second submit.

The independently reconstructable `@company-os/http-agent-node-reference`
package now implements the node-side protocol, constant-time authentication,
atomic-file secret-free state, submit/command idempotency and ordered
observations. A customer supplies the actual Agent driver; the reference server
is not an Agent. Client/server interoperability survives both node and control
plane reconstruction. A separate live PostgreSQL 16 admission closes and
recreates four service compositions, routes the exact approval through a signed
Better Auth Cookie and company membership, sends PAUSE/RESUME once each, and
finishes with evidence, result and an empty outbox.

This proves the maintained protocol and recovery contracts. It does not prove
compatibility with a real vendor or customer Agent driver, and the synthetic
driver must never be described as one. Repository-wide open-source licensing remains a release gate;
the package is marked private to prevent accidental publication before that
decision.
