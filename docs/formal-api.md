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
