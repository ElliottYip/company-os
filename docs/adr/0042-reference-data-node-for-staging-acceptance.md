# ADR 0042: ship a fixture-only reference Data Node for staging acceptance

Status: accepted — 2026-08-26

## Context

Release candidate 3 shipped the HTTP Data Node client and OpenAPI contract but
no runnable server. A generic Node base image was present in deployment
inventory, but a base image is not an implementation and must not be reported
as a complete data boundary.

Company OS needs a deterministic, restartable node for non-production staging
acceptance while preserving the product boundary: enterprise records and
customer credentials stay outside the control plane, and a real enterprise
deployment remains free to replace the node through the protocol contract.

## Decision

The repository owns a small `http-data-node-reference` server and publishes it
as a separately attested image. It is fixture-only and is never described as a
live enterprise connector.

The reference node:

- implements HTTP Data Node protocol `1.0` with bearer authentication;
- accepts only an explicit synthetic catalog and source/operation/classification
  allowlist;
- supports synthetic `READ` only and rejects under-classifying fixture data;
- returns opaque data/evidence references and a SHA-256 content digest, never
  record content;
- persists only request digests and granted references so idempotency survives
  restart;
- rejects private reasoning, credentials, raw data fields, protocol drift,
  request conflicts, oversized input, and unsupported access with stable codes;
- reads its bearer token from a restricted file and stores state on its own
  environment-owned volume;
- is included in release provenance, staging start, runtime inspection,
  cutover evidence, and rollback planning.

The public Company OS API continues to consume the node through the existing
HTTPS connector. TLS terminates at environment-owned ingress; the container
binds only a host-loopback port for that proxy. The control-plane client does
not gain an insecure private-network exception.

## Consequences

Staging can prove governed request, denial, grant, digest, restart, and replay
behavior without production data or a paid provider. It cannot claim that a
customer enterprise source has been integrated. Level-2 customer acceptance
still requires a separately authorized real Data Node when that is the stated
acceptance scope.

Opaque authorization contract and receipt IDs are checked for bounded protocol
shape, not cryptographic authenticity. A real customer Data Node must validate
its own authorization receipt before source access; the fixture server is not
evidence that this customer-side responsibility has been implemented.

The release manifest gains the additive `images.referenceDataNode` field. RC3
therefore remains immutable and incomplete for the new full-stack definition;
a later release candidate must be built and qualified from the new source
revision.

The cutover planner may accept the field as absent only on the previous side
of a five-image legacy release. It records that absence as
`ABSENT_BY_RELEASE_CONTRACT`, requires the current release to contain the
digest-bound image, and labels the topology change `ADDED_FIXTURE_ONLY`. It
never invents a prior image or weakens the six-image current-release contract.
