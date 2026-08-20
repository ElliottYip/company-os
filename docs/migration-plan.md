# Progressive migration plan

## Admission rules

1. Freeze and hash the exact Raft candidate before review.
2. Classify it as neutral core/application, Company OS adapter, or Raft-owned.
3. Reauthor neutral behavior under Company OS naming and tests; never add a
   runtime import to Raft.
4. Map host formats only in an explicit adapter and preserve opaque IDs.
5. Run independent tests, boundaries, type check, and build.
6. Run Raft-side adapter/compatibility verification.
7. Delete nothing until the acceptance record lists exact paths and both sides
   have passed.

## Received in this scaffold

- Neutral control-plane types and source acceptance behavior.
- Organization/accountable-human validation.
- Responsibility contracts with critical-action human approval.
- Staged work candidate with responsibility resolution and cycle protection.
- Identity, event store, agent runtime, and approval port concepts, expanded
  into the product-charter port surface.
- Boundary-guard and independence-audit decisions.

## Remain in Raft as adapter contracts

- ACP connector/runtime/session/vault implementation.
- Nostr event kinds and Nostr-shaped schemas/parsing.
- Relay ingest, projection, validation, and publication.
- NIP-07 signer, relay client, Raft route/navigation/theme, and mount code.
- Serializer compatibility for event kinds 30179–30189, 30624–30627, 46021,
  `snake_case`, and `schema_version`.

## Pre-3D reception status

The listed independent slices are complete: credential access is reference-only
and audited, both profiles share the durable operational contract, Demo has a
real-browser responsibility loop, Agent Boss/formal administration projections
are versioned, every egress decision persists, and Office Compiler/renderer
conformance is frozen at `1.0`.

See `docs/deployment-migration-handoff.md` for runtime upgrade/rollback. Any
future Raft adapter migration remains a separate, compatibility-tested change;
the next visual phase may consume the frozen contracts but must not move 3D
business logic into Raft Web.
