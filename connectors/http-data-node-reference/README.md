# HTTP Data Node reference server

This private package is a maintained server-side implementation of the
Company OS HTTP Data Node protocol for deterministic staging acceptance. It is
not an enterprise data connector and it never represents fixture data as live.

The service authenticates every request, enforces protocol version 1.0,
applies an explicit source/operation/classification allowlist, and returns only
opaque fixture/evidence references plus a content digest. It never returns
record content, credentials, external sessions, or private reasoning.

`JsonFileReferenceDataNodeStore` persists only request digests and granted
references so idempotency survives restart. The fixture catalog and state
volume remain environment-owned. A real deployment replaces this reference
server with a customer-owned Data Node implementing the same OpenAPI contract.
