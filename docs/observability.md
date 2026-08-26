# Operational observability

Company OS separates liveness, readiness, metrics and product audit evidence.
None of these surfaces is a substitute for the responsibility chain.

## Endpoints

- `GET /health` proves that the API process can answer. It does not touch an
  identity provider, PostgreSQL, Connector, Broker or model provider.
- `GET /ready` checks traffic dependencies and returns `503` when a required
  public deployment dependency fails. Optional adapters are explicitly
  degraded rather than reported as healthy. Installed Connector, model,
  Secret Broker, and Data Node ports are actively probed through their bounded
  `health()` contracts; installation alone is never reported as health.
- `GET /metrics` is disabled by default. Set
  `COMPANY_OS_METRICS_ENABLED=true` only on `private` deployment exposure and
  restrict the route at the internal reverse proxy or service mesh.

The Prometheus text surface uses fixed-cardinality labels only: route family,
bounded HTTP method and status class. It never emits a URL, tenant, principal,
Work, Agent, Connector package, external address, error text or credential.
Current metrics are:

- `company_os_http_requests_total`
- `company_os_http_requests_in_flight`
- `company_os_http_request_duration_milliseconds`
- `company_os_dependency_health` with only the fixed dependency categories
  `configuration`, `database`, `connector`, `model`, `secret_broker`, and
  `data_node`
- `company_os_connector_command_outcomes_total` with only `delivered` and
  `retry_pending`
- `company_os_secret_lease_revocation_outcomes_total` with only `revoked` and
  `retry_pending`

Managed-cloud must expose metrics through a private operations network or
collector, never by enabling the route on a publicly exposed API instance.

The API process also owns explicit denial-of-service bounds rather than relying
on Node defaults: 15-second request lifetime, 10-second header lifetime,
5-second keep-alive, at most 100 headers, 100 requests per socket and 1,024
simultaneous connections. Enterprise ingress should impose a stricter
environment-specific request-rate and connection budget; Better Auth separately
uses its database-backed authentication rate limiter.

## Minimum alerts

Operators should configure, tune and rehearse at least:

1. `/ready` failing for two consecutive probe windows.
2. HTTP `5xx` ratio above the environment baseline for five minutes.
3. p95 request duration above the declared SLO for ten minutes.
4. PostgreSQL storage, connection saturation and backup age alarms.
5. Connector delivery retry, observation gap and outcome-unknown events.
6. Secret lease revocation retries and Broker unavailability.
7. OIDC login/callback failures without recording identity claims or tokens.

Alert payloads use stable codes and infrastructure coordinates. They must not
copy user input, Agent output, evidence content, external sessions or private
provider errors.

API lifecycle and Connector supervisor events use the versioned structured log
schema in `adapters/http/structured-operational-log.ts`. Its closed field set
intentionally excludes tenant, principal, Work, Agent, URL, provider message and
stack fields. Adding a new field is a security-sensitive schema change and must
include a negative disclosure test.

## Evidence retention boundary

Operational logs answer whether the service is healthy. Company events,
approval bindings, evidence digests and responsibility projections answer who
was responsible for work. Do not export the latter wholesale into metrics or
logs. Evidence retention and deletion follow company policy and tenant export
contracts; metrics have an independent short operational retention window.
