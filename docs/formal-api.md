# Formal API boundary

The versioned formal API is separate from `/api/demo`. Demo identity can never
authorize a formal request, and a formal tenant read is resolved through
`IdentityPort` plus an explicit authorization receipt.

## Agent Boss projection v1

`GET /api/v1/companies/{companyId}/agent-boss`

The response is a Company OS-owned projection containing organization, humans,
Agents, responsibility-contract revision, accountable work, execution-attempt
summaries, and pending exact-action approvals. `schemaVersion` is the wire
compatibility boundary; UI code must not inspect persisted events directly.

Errors use a stable non-localized contract:

```json
{"error":{"code":"TENANT_MISMATCH","parameters":{}}}
```

Display copy is not an API contract. Current stable codes are
`FORMAL_IDENTITY_REQUIRED`, `TENANT_MISMATCH`,
`AUTHORIZATION_PRINCIPAL_MISMATCH`, `ORGANIZATION_NOT_FOUND`,
`FORMAL_API_UNAVAILABLE`, and the closed fallback `OPERATION_REJECTED`.
User input, Agent output, evidence, and audit records retain their original
language; later localization maps codes in the client without changing domain
records.

## Agent Boss commands v1

`POST /api/v1/companies/{companyId}/work` accepts a bounded accountable-work
draft. The route owns `companyId`; the body cannot select another tenant. The
application revalidates the current formal identity, initiator, Agent,
responsibility contract, allowed actions, and exact authorization receipt.

`POST /api/v1/companies/{companyId}/approvals/{requestId}/decisions` accepts
`APPROVED` or `REJECTED` plus the complete expected approval binding. The route
owns both tenant and request ID. Any changed action digest, work, contract,
Agent, accountable human, evidence, result, expiry, or prior decision fails
closed.

Mutation requests require an allowed origin and bounded JSON body. Stable
transport errors include `INVALID_FORMAL_COMMAND`, `ORIGIN_NOT_ALLOWED`,
`REQUEST_BODY_TOO_LARGE`, and `FORMAL_COMMAND_UNAVAILABLE`.

## Administration projection v1

`GET /api/v1/companies/{companyId}/administration` returns the revisioned
Connector catalog, model routes, data-authorization contracts, and persisted
egress decisions. It exposes only `secretConfigured` and
`credentialConfigured`; Secret reference identifiers and material are not part
of the response. Egress records contain policy inputs by reference/digest, not
exported content.
