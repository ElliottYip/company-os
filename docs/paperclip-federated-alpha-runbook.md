# Paperclip Federated Connector — private Alpha runbook

Status: code-admitted against official `v2026.817.0` contracts; official API
transport accepted against a private local sandbox with synthetic zero-budget
records; authenticated remote sandbox and private OIDC Alpha acceptance pending

## Boundary

This connector is for the private OIDC-protected Alpha only. It is not mounted
in `deploy/compose.public-demo.yml` and must never share the public Demo API,
network, Secret projection or origin.

It reads Agent inventory and bounded Issue projections. It does not execute
Paperclip Agents, read Issue descriptions or logs, import sessions, or claim
usage/cost support. The source remains the execution owner.

## Required configuration

Supply the following non-secret values to the formal API runtime:

```text
COMPANY_OS_FEDERATED_SOURCE_PACKAGES=@company-os/federated-source-reference
COMPANY_OS_PAPERCLIP_BASE_URL=https://paperclip-sandbox.example
COMPANY_OS_PAPERCLIP_ANC_COMPANY_ID=<existing-anc-company-id>
COMPANY_OS_PAPERCLIP_COMPANY_ID=<external-paperclip-company-uuid>
COMPANY_OS_PAPERCLIP_CONNECTOR_ID=paperclip-alpha
COMPANY_OS_PAPERCLIP_RUNTIME_AGENT_ID=<anc-runtime-agent-id>
COMPANY_OS_PAPERCLIP_ACCOUNTABLE_HUMAN_ID=<anc-human-id>
COMPANY_OS_PAPERCLIP_AGENT_BINDINGS=[{"externalAgentId":"<uuid>","agentId":"<anc-agent-id>","accountableHumanId":"<anc-human-id>"}]
COMPANY_OS_PAPERCLIP_AUTHORIZATION_FILE=/run/secrets/paperclip-board-key
```

The authorization file contains only the raw Paperclip board/API key. The API
adds the `Bearer` scheme in memory. Inline
`COMPANY_OS_PAPERCLIP_AUTHORIZATION` is rejected. The file must be readable
only by the API runtime identity and must not be included in a release bundle,
Compose interpolation, command argument, log or evidence record.

The installed-package selector and all eight adapter fields are required.
Partial configuration fails process startup. Formal PostgreSQL/OIDC
configuration must already be complete. The public Demo runtime fails closed
if any Federated Source package is selected.

## Admission sequence

1. Create a non-production Paperclip company and a short-lived/revocable board
   API key using the external platform's documented operator flow.
2. Register the connector capability and create the ANC runtime/Agent records,
   accountable-human bindings and grants in the private Alpha company.
3. Mount the credential file and start only the private formal API candidate.
4. Sign in through enterprise OIDC as an authorized human.
5. Send an empty `POST` from the allowed formal Web origin to
   `/api/v1/companies/<anc-company-id>/portfolio-sources/paperclip-alpha/synchronize`.
6. Confirm response counts and bounded anomalies. A second unchanged sync must
   replay Work rather than duplicate it.
7. Confirm external execution ownership, management depth, source return links
   and accountable-human mappings in Agents and Work.
8. Confirm no Issue description, adapter config, external user/run/session ID,
   raw response, credential or private log appears in responses, events or logs.
9. Revoke/rotate the sandbox key and confirm sync fails without changing prior
   portfolio state; restore a fresh key and repeat.

## Current stop condition

The retained local acceptance proves real official Agent and Issue API reads,
neutral inventory/Work projection, bounded fields and stable replay. It does
not prove credential rejection because Paperclip `local_trusted` mode accepts
private-loopback requests without enforcing the board API key. The temporary
key was revoked and its files removed after the exercise.

Do not mark this connector production-ready or private-Alpha live until an
authenticated non-production Paperclip URL, company ID, Agent mappings and
credential file are available and the complete sequence above has retained
sanitized evidence through the OIDC-protected Company OS formal route. Do not
use production Agent data or a personal credential for Alpha admission. See
`docs/acceptance/2026-08-27-paperclip-federated-connector-sandbox.json`.
