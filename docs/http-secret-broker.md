# HTTP Secret Broker runbook

Status: the installed neutral client, lease audit and automatic revocation are
implemented. A maintained Vault KV v2 adapter now covers AppRole login,
exact-version reads and CAS writes, durable opaque leases, execution-only
redemption, and Broker-owned create/rotate/suspend/revoke management sessions.
Synthetic compatibility tests pass. The real Vault compatibility admission
(`npm run test:vault:compatibility`) starts a digest-pinned official Vault
container with synthetic data, configures AppRole and a least-privilege KV v2
policy, and proves create, exact-version redemption, CAS rotation, stale-lease
fencing, suspension, revocation, and Broker restart. It always removes the
temporary container and state. A customer-operated Vault acceptance remains
required before staging or production claims.

Use `docs/customer-boundary-acceptance.md` for the coordinate-free TLS
preflight and the separately authorized staging execution checklist.

`@company-os/http-secret-broker` connects Company OS to a customer-operated
HTTPS Secret Broker. Company OS stores only opaque reference IDs, purpose,
provider binding, version, status, authorization receipts, lease metadata and
attestation digests. Credential values, private keys and provider sessions
remain outside the control plane.

## Configuration

```text
COMPANY_OS_SECRET_BROKER_PACKAGE=@company-os/http-secret-broker
COMPANY_OS_HTTP_SECRET_BROKER_BASE_URL=https://broker.example.com
COMPANY_OS_HTTP_SECRET_BROKER_BEARER_TOKEN=<injected by deployment secret manager>
```

Optional variables:

- `COMPANY_OS_HTTP_SECRET_BROKER_ID`
- `COMPANY_OS_HTTP_SECRET_BROKER_NAME`
- `COMPANY_OS_HTTP_SECRET_BROKER_TIMEOUT_MS` (250–60,000)
- `COMPANY_OS_HTTP_SECRET_BROKER_MAXIMUM_LEASE_SECONDS` (1–900)

Production requires HTTPS. The insecure-loopback flag exists only for isolated
tests and accepts no non-loopback address. URLs containing credentials, query
parameters, fragments or path prefixes are rejected. Redirects are disabled.

## Broker API v1

- `GET /v1/health`
- `GET /v1/companies/{companyId}/references/{referenceId}`
- `POST /v1/leases`
- `POST /v1/companies/{companyId}/leases/{leaseId}/revocations`
- `POST /v1/reference-management-sessions`
- `GET /v1/companies/{companyId}/reference-management-sessions/{sessionId}`

The reference endpoint returns metadata only. Lease issuance accepts the
tenant, reference, expected version, consumer, immutable Work Attempt, reason,
expiry and Company OS authorization receipt. A successful response contains an
opaque lease ID and SHA-256 attestation; it never contains material redeemable
by the browser or control plane. Redemption is an execution-node-to-Broker
operation outside this API. The maintained Vault implementation exposes it as
`POST /v1/redemptions`, documented by
`brokers/vault-secret-broker/redemption-openapi.json`, under a different bearer
authority. The Company OS API can issue and revoke opaque leases but cannot
redeem them.

Revocation must be idempotent. `revoked: true` means the lease can no longer be
redeemed, including on a replayed request.

Reference management is browser-mediated. Company OS sends only the tenant,
reference ID, operation (`CREATE`, `ROTATE`, `SUSPEND`, or `REVOKE`), purpose,
provider adapter ID, expected version and authorization receipt. The Broker
returns a short-lived same-origin management URL. The user enters credential
material only on that Broker-owned page. Company OS returns the URL to the
current browser but never writes it to the event stream.

Status polling returns `PENDING`, a stable `FAILED` code, or `COMPLETED` with
metadata-only reference state. Company OS verifies the tenant, binding, exact
version transition and final status before recording completion. A Broker that
implements only execution leases remains valid, but its administration UI is
reported unavailable and fails closed.

## Runtime lifecycle

Company OS records `secret.access-authorized` before requesting a lease and
then records either `secret.lease-issued` or a stable failure code. When the
bound Attempt stops running, the supervisor records a revocation request before
calling the Broker. Success records `secret.lease-revoked`. Failure records no
raw Broker text and retries with delays of 30, 60, 120 seconds and so on, capped
at 15 minutes.

`OUTCOME_UNKNOWN` also revokes leases: uncertainty about an external side
effect must not preserve execution authority. A cancellation request by itself
does not revoke while the Agent may still be stopping; revocation follows the
terminal or unknown outcome transition.

## Rotation boundary

Secret values and versions are created and rotated in the enterprise Broker.
Company OS uses `expectedVersion` to fail closed if a Work Attempt or management
session was authorized against an older version. The self-service Web starts a
Broker-owned management session and then confirms only the metadata transition.
Operators must never compensate for an unavailable Broker by entering Secret
values into the Company OS Web or database.

## Maintained Vault adapter

The release image is built from `deploy/Dockerfile.vault-secret-broker`. Runtime
configuration is listed in `deploy/vault-secret-broker.env.example`; AppRole
Role ID, Secret ID and both bearer authorities are accepted only from absolute
files. The management signing key is file-injected as a third,
non-interchangeable authority. Reference-to-Vault coordinates and provider
management profiles are mounted from a private JSON file; the shape is
demonstrated by `deploy/vault-secret-broker.references.example.json`.
`deploy/compose.vault-broker.yml` supplies a non-root, read-only, resource-bounded
deployment unit with file mounts and a dedicated state volume. It binds only
to loopback; a customer-owned HTTPS ingress must serve the configured public
origin.

Lease state contains no Vault path, field name, environment variable or
credential value. A separate mode-0600 Broker-owned reference registry stores
private Vault coordinates and management-session metadata, but never a Secret
value or plaintext management token. Company OS receives only public reference
metadata.

The AppRole policy should grant only `read` on the exact KV v2 data paths and
the health/login calls needed by this Broker. KV reads always name an exact
secret version. Vault client tokens stay in memory and are refreshed before
expiry. The Broker never sends a Vault token to Company OS or an Agent Node.

For create and rotate, the Broker page submits material directly to the Broker
origin. Vault KV v2 check-and-set binds create to version zero and rotation to
the exact expected version, so concurrent changes fail closed. The returned
management URL is a short-lived HMAC capability; only its digest is durable.
Pages use `no-store`, deny framing, suppress referrers and permit forms only to
the same origin. They never display an existing value or the private Vault
field/environment mapping.

Suspend and revoke update Broker authority without deleting Vault history.
Both immediately make all matching leases non-redeemable; rotation also fences
leases issued for the prior version. Destructive Vault version deletion remains
an explicit enterprise retention operation outside Company OS.

This first staging adapter deliberately uses one execution bearer for one Codex
Agent Node. A multi-node or production deployment must replace that shared
authority with per-node identity or mTLS and consumer-scoped authorization.
That limitation is explicit; it is not a production-readiness claim.

Official Vault contracts used by the adapter:

- AppRole API: https://developer.hashicorp.com/vault/api-docs/auth/approle
- KV v2 API: https://developer.hashicorp.com/vault/api-docs/secret/kv/kv-v2
- response wrapping concepts: https://developer.hashicorp.com/vault/docs/concepts/response-wrapping

The current design does not use response wrapping: material stays behind the
Broker, and the authenticated execution node redeems a Broker-owned opaque
lease directly. Synthetic test credentials are labelled and never represented
as a real enterprise system.
