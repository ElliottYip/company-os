# ADR 0047: Run the public Demo as an isolated runtime profile

## Status

Accepted

## Date

2026-08-27

## Context

RC7 contains a verified anonymous Demo surface, but the only release Compose
contract is the formal staging topology. That topology requires PostgreSQL,
OIDC, Secret Broker, Agent/Data Nodes, migration, and provisioning before API
readiness can pass. Reusing it for the exhibition Demo would either make the
Demo depend on formal infrastructure or encourage placeholder credentials.

The Demo must be publicly reachable and recoverable while remaining incapable
of accessing enterprise identity, data, credentials, models, or real external
Agents. The authenticated Alpha must later connect real platforms without
turning the anonymous Demo into an authentication bypass.

## Decision

Introduce an explicit service runtime mode:

- `formal` remains the default and forbids the anonymous Demo surface;
- `public-demo` requires `COMPANY_OS_PUBLIC_DEMO_ENABLED=true` and forbids
  formal identity/database configuration plus every external Connector, model,
  data, and Secret Broker package.

`deploy/compose.public-demo.yml` contains only one API replica and one Web
replica. It mounts no Secret or state volume, uses an internal no-egress Docker
network, publishes only host-loopback ports, and relies on a separately
authorized host TLS proxy for ingress. Its readiness contract passes only when
all formal and external runtime boundaries are absent. A Demo cookie remains
forbidden on every `/api/v1` route.

The formal Alpha stays a separate deployment and identity boundary. Real
Connector credentials belong only there as opaque, scoped Secret references.

## Alternatives considered

### Enable the Demo flag in formal staging

Rejected. Anonymous and authenticated surfaces would share runtime
configuration, dependencies, failure modes, and Secret mounts.

### Supply placeholder OIDC and database values

Rejected. Placeholder trust material creates a misleading readiness signal and
can accidentally weaken formal fail-closed behavior.

### Build a separate Demo application

Rejected. It would drift from the real Web/API product and duplicate the
three-minute acceptance path. A constrained runtime profile of the same images
provides stronger evidence.

## Consequences

- Existing formal deployments keep the default `formal` mode and must keep the
  public Demo flag off.
- Browser admission explicitly starts `public-demo` mode.
- Release handoff bundles include the independent Demo Compose contract.
- Public ingress, rate limits, bounded session capacity, monitoring, and
  target-host acceptance remain required before traffic opens.
- Real Connector installation never occurs in the anonymous Demo runtime.
