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

## Next Company OS slices

1. Contract-test a real credential-reference vault boundary and provider/data
   isolation without adding paid credentials.
2. Add persistence adapters for managed and local profiles behind the same
   event/evidence tests.
3. Expand Demo E2E to the full three-minute browser loop and template promotion
   sanitization.
4. Build Agent Boss organization/task/approval/evidence projections.
5. Add model/data administration and egress-policy UI.
6. Expand Office Compiler with projects, adjacency, capacity, and renderer
   contract tests before any 3D work.

