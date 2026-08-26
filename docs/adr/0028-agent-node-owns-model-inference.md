# ADR 0028: Agent Node is the sole owner of model inference

Status: Accepted
Date: 2026-08-25

## Context

Company OS must govern model policy, provider eligibility, data classification,
residency, credential authorization and responsibility without becoming a
vendor session proxy. The model-provider port originally exposed an unused
`complete()` method even though formal dispatch sends the frozen model binding
and opaque Broker grant to the Agent Node. Keeping both paths would create two
possible execution owners, two retry/idempotency domains and an ambiguous place
for prompts, outputs and provider sessions.

The hybrid deployment model also requires inference, credentials and private
execution context to remain in the customer execution plane. A control-plane
model call would violate that boundary even if it carried references rather
than raw prompt text.

## Decision

- The customer-operated Agent Node is the sole owner of model inference for a
  Work Attempt. It owns provider I/O, provider idempotency and any private
  vendor session.
- Company OS owns model governance only: route policy, installed-provider
  capability and health inspection, canonical capability fingerprinting,
  classification/residency validation, exact Attempt authority and auditable
  Broker-grant issuance/revocation.
- `ModelProviderPort` and installed `ModelProviderRuntimePort` expose only
  `capabilities()` and `health()`. They cannot accept prompts or return model
  outputs.
- The Agent Node receives a secret-free `modelBinding` and the exact opaque
  `executionGrantReference`. It may redeem that grant only for the named
  provider boundary and bound Work Attempt.
- Provider credentials, raw prompts, raw outputs, vendor sessions and private
  reasoning never cross the control-plane model-provider port or enter Company
  OS events/outbox records.
- Company OS evidence and usage projections receive admitted references,
  digests and verified accounting records through the existing Connector and
  budget contracts; they do not infer them from provider text.

## Alternatives considered

### Let Company OS call the model provider directly

Rejected because it makes the control plane a credential and content path,
breaks customer-local execution, and competes with the Agent Node for retry and
session ownership.

### Allow either the control plane or Agent Node to execute by deployment profile

Rejected because the same Work contract would have different security,
idempotency and evidence semantics across managed-cloud and self-hosted.

### Put provider credentials in the Connector request

Rejected because Work requests, durable outbox records and support exports must
remain secret-free. Only a short-lived opaque Broker grant crosses the boundary.

## Consequences

- Installed model-provider packages are control-plane metadata/health adapters,
  not inference clients.
- A real customer acceptance run must prove Agent Node grant redemption,
  provider invocation, output/evidence references, verified usage and terminal
  lease revocation. Reference fixtures cannot satisfy that production gate.
- Provider-specific streaming, tool-call and session behavior stays behind the
  customer Agent driver. New common behavior enters Company OS only after it is
  represented as a vendor-neutral Connector capability.
- Removing the unused `complete()` method is a pre-release contract correction;
  no persisted data or production execution path depends on it.
