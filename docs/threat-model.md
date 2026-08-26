# Company OS Pre-3D threat model

Status: Active design constraint  
Method: STRIDE plus AI-agent abuse cases

## Assets

- Human identity and organization membership.
- Responsibility contracts and approval decisions.
- Agent/model/data connector bindings and credential references.
- Company goals, work inputs, evidence, results, and audit history.
- Data authorization contracts and egress decisions.
- Runtime proofs, idempotency keys, configuration, backups, and availability.

Raw credentials, vendor private sessions, private reasoning, and production data
are prohibited from this development program.

## Trust boundaries

1. Browser or host mount → Company OS service/application boundary.
2. Identity assertion → `IdentityPort` verifier.
3. Company command → authorization and responsibility policy.
4. Company OS → agent connector.
5. Company OS → model-provider capability/health boundary; Agent Node → Broker/provider execution boundary.
6. Company OS → company data connector and egress firewall.
7. Application → event/evidence store and backup.
8. managed-cloud control plane ↔ customer-local execution plane.
9. Demo template/runtime ↔ formal organization state.
10. Office scene → replaceable renderer and future asset runtime.

## Primary abuse cases and required controls

| Abuse case | STRIDE | Required control/test |
|---|---|---|
| Reuse another organization's identity or record ID | S/E/I | Organization-scoped assertion and authorization on every command/read |
| Replay an approval or runtime proof | S/T/R | Expiry, nonce/idempotency, exact digest, single-decision rule |
| Approve a different action than the paused one | T/E | Bind action/work/contract/agent/human/evidence/result digest |
| Connector reports unsupported progress/evidence | T | Capability negotiation and transition conformance |
| Connector smuggles credential/private session | I | Schema field allowlist, size bounds, secret-pattern negative tests |
| Model output becomes command/HTML/query | T/E | Treat as untrusted data; typed intent allowlist; text encoding |
| Agent exports unauthorized company data | I/E | Default-deny egress policy and auditable contract-bound decision |
| Demo reaches production adapters or records | E/I | Separate composition, fixture provenance, no-side-effect test, rebinding gate |
| Duplicate submit creates duplicate work/spend | T/D | Idempotency key and deterministic duplicate result |
| Connector forges or replays usage against another model/Work | T/R | Derive authority from frozen Attempt; digest-bound usage reference; atomic idempotent ledger ingestion |
| Oversized/recursive input exhausts service | D | Request/payload/record/depth/time bounds and rate policy |
| Store or backup is silently modified | T/R | Digest chain, corruption detection, append sequence, restore validation |
| Error/log exposes secret or private record | I | Field allowlists, redaction, stable public errors, no stack traces |
| Office renderer gains business authority | E | Renderer consumes immutable scene only; no identity/store/execution imports |

Secret material remains in a deployment-selected broker and never crosses the
Company OS domain/application boundary. Formal access records the authorized
intent before lease issuance. The control plane receives only a reference,
version, consumer/work-attempt binding, expiry, and attestation digest; broker
failure events persist a stable code rather than provider output.

Broker-owned management URLs are short-lived HMAC capabilities. Company OS
returns them only to the currently authorized browser and never persists them
in domain events. The Broker stores only their digest, serves forms with
`no-store`, `frame-ancestors 'none'`, `form-action 'self'` and `no-referrer`,
and never renders an existing Secret. Control and execution bearer authorities
cannot substitute for the browser capability.

## Security invariants

- Deny by default when identity, permission, data contract, capability, proof,
  or exact approval binding is absent or stale.
- Client-side state never grants formal authority.
- Same login does not mean same token audience, role, or permission.
- Model/connector output is untrusted and cannot directly execute code, query a
  store, render HTML, or choose a file path.
- High-risk actions remain paused until a currently authorized human decides.
- Every security-relevant accept/deny decision produces a sanitized audit event.
- Demo state and formal state have distinct provenance and storage namespaces.

## Verification gate

- Abuse-case tests run in `npm run verify`.
- Secret scan includes Git-tracked source and generated fixture records.
- Dependency audit has no critical/high reachable finding.
- Browser responses include restrictive security headers.
- Backup corruption and cross-organization access tests fail closed.
