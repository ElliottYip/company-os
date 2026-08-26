# Customer boundary acceptance

Status: repository-controlled preflight implemented; customer staging execution
and production sign-off remain external acceptance gates.

Company OS treats the enterprise IdP, Agent Node, model execution boundary,
Data Node and Secret Broker as customer-owned trust boundaries. The control plane must not import their private
SDK types, copy their credentials into company data, or infer readiness from a
configured URL.

Before implementation, generate customer-node stubs or validate an existing
service against the three versioned OpenAPI artifacts documented in
`docs/execution-plane-openapi.md`. Passing an OpenAPI check does not replace the
runtime TLS, idempotency, restart and side-effect evidence below.

## Level 1 — read-only preflight

Run the preflight from the exact API image and network policy intended for the
deployment. Configure the existing `COMPANY_OS_OIDC_*`,
`COMPANY_OS_HTTP_AGENT_NODE_*`, `COMPANY_OS_HTTP_DATA_NODE_*` and
`COMPANY_OS_HTTP_SECRET_BROKER_*` variables through the deployment secret
manager, then execute:

```sh
npm run ops:preflight:customer-boundaries
```

For a private enterprise CA, mount the CA bundle read-only and set
`NODE_EXTRA_CA_CERTS` to its in-container path. Never use
`NODE_TLS_REJECT_UNAUTHORIZED=0`.

This command is deliberately read-only. It verifies:

- exact HTTPS OIDC issuer and Discovery transport;
- authorization, token and JWKS endpoint structure;
- advertised S256 PKCE support;
- authenticated protocol `1.0` health for the Agent Node, Data Node and Secret
  Broker;
- fixed, coordinate-free output suitable for an acceptance record.

It does not create a company, deploy an Agent, read enterprise data, issue a
Secret lease or execute Work. A `PASS` therefore proves network, certificate,
authentication and health compatibility only.

The repository gate `npm run test:customer-boundaries:tls` runs the same command
as a child process against four real loopback HTTPS endpoints using a generated
trusted CA. It does not disable certificate verification and uses only
runtime-generated synthetic tokens.

## Level 2 — customer staging execution

Before touching the staging tenant, bind the exact immutable release manifest
to a coordinate-free ordered plan:

```sh
npm run ops:plan:customer-acceptance -- release-manifest.json CUSTOMER_STAGING > acceptance-plan.json
```

For a production change window, use `PRODUCTION` as the final argument. The
result is deliberately labelled `PLANNED_NOT_EXECUTED`; it contains no customer
coordinates, credentials, owner identities or evidence claims. It enumerates
the required owner roles, all evidence slots and which steps require explicit
customer staging or production-change authorization. Generating this file is
not permission to run the side-effecting steps and is not acceptance evidence.

Use a dedicated non-production tenant, synthetic data source and disposable
Secret reference. The acceptance owner records only opaque IDs and digests.
The required evidence is:

1. A real enterprise browser completes authorization-code + S256 login and the
   external `sub` binds to one Company OS portable human ID.
2. A company-scoped accountable human creates one test Agent and approves its
   exact responsibility contract.
3. The Agent Node accepts one idempotent test Work, emits ordered progress,
   pauses on an exact high-risk action, resumes after the matching human
   approval and returns evidence/result references.
4. The Agent Node redeems the exact `MODEL_INFERENCE` grant at the frozen
   Provider, completes one real test inference, returns output/evidence and
   verified usage references that enter the Company OS budget ledger, and exposes no credential, raw prompt, raw output
   or private provider session to the control plane.
5. The Data Node denies an unauthorized request without source access, then
   grants an exact authorized test request while returning references and a
   digest rather than raw data.
6. The Secret Broker issues a short-lived lease to the exact Attempt and proves
   it is revoked after the Attempt becomes terminal or outcome-unknown.
7. Replaying submission, approval, model execution, data access and revocation produces no
   duplicate side effect.
8. Restarting the Company OS API during the flow preserves the company,
   session, Work, Attempt, approval, evidence and outbox state.

This level is intentionally not automated against arbitrary endpoints. It has
external side effects and requires the customer to approve the staging scope,
test identities, data authorization contract and disposable Secret reference.

## Level 3 — production sign-off

Production admission additionally requires the customer's change record,
certificate-chain and hostname evidence, ingress/egress allowlists, token
rotation owner, IdP logout/session policy, backup destination and retention
owner, monitoring route, incident contacts, rollback window and legal-hold
policy. Store the resulting evidence outside source control; commit no tokens,
customer URLs, personal data or production identifiers.

The release is not declared production-accepted until all three levels have
named human owners. A synthetic or Demo result must never be labelled as real
customer acceptance.

## Coordinate-free acceptance record

After external evidence has been retained in the customer's approved system,
create a coordinate-free JSON record and validate its contract with:

```sh
npm run ops:validate:customer-acceptance -- acceptance-record.json
```

The schema-v2 record binds the exact release version, source revision and release-manifest
digest; opaque human owner IDs; all nine Level 2 evidence digests; and, for
production, all eleven Level 3 evidence digests. It rejects URLs, email-like
identifiers and credential-/token-/personal-data fields. The validator returns
`RECORD_STRUCTURALLY_VALID`, `independentlyVerified: false` and
`externalEvidenceRequired: true`: schema validation must never be presented as
proof that a customer actually ran or approved the tests.

Required Level 2 keys are `boundaryPreflight`, `browserIdentity`,
`responsibilityContract`, `agentExecution`, `modelExecution`, `dataBoundary`,
`secretLifecycle`, `idempotency` and `restartRecovery`. Production additionally requires
`changeRecord`, `certificateChain`, `networkPolicy`, `rotationOwnership`,
`sessionPolicy`, `backupDestination`, `retentionPolicy`, `monitoringRoute`,
`incidentContacts`, `rollbackWindow` and `legalHoldPolicy`.
