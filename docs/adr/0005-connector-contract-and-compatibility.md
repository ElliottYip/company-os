# ADR 0005: Provider-neutral connector and Raft compatibility boundary

Status: Accepted  
Date: 2026-08-18

## Decision

All agents use one versioned connector contract with opaque stable IDs,
capability declaration, identity binding, health, task input, progress,
approval pause/resume, evidence/results, cancellation, timeouts, idempotency,
and short-lived secret-free runtime proof.

High-risk approval binds the exact action/digest/work/contract/agent/human/
evidence/result tuple. Connector messages contain neither credentials, vendor
private sessions, nor private reasoning.

Raft event kinds 30179–30189, 30624–30627, and 46021, plus existing
`snake_case`/`schema_version` records, remain serializer concerns in a Raft
adapter. A Nostr public key is only an external identity reference.

## Consequences

- Raft Agent, Codex, DeepSeek, and enterprise agents remain peers.
- Core contracts do not expose Nostr, ACP, relay, or vendor session types.
- Compatibility is testable at adapter serialization boundaries later.

