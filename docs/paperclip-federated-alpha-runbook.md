# Paperclip Federated Connector — private Alpha runbook

Status: code-admitted against official `v2026.817.0` contracts; official API
transport and API-key revocation accepted in a private authenticated local
sandbox with synthetic zero-budget records. A 2026-08-28 repeat against the
operator's current private `local_trusted` workspace accepted real Agent and
Issue reads, bounded projection and stable replay, but correctly did not claim
authorization enforcement because that Paperclip mode bypasses Board-key
checks. Private OIDC Alpha acceptance and a customer-owned non-production
tenant remain pending.

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

Use [`compose.private-alpha-paperclip.yml`](../deploy/compose.private-alpha-paperclip.yml)
as an overlay on exactly one formal profile. Do not combine it with
`compose.public-demo.yml`. Set `COMPANY_OS_PAPERCLIP_SECRET_DIRECTORY` to a
private directory owned by the API runtime UID (`1000` in the release image).
The directory should use mode `0700`; `paperclip-board-key` must be a regular,
single-link file owned by that UID with mode `0400` or `0600`. Symbolic links,
group/world access, an inline credential and a credential owned by another UID
all fail closed.

Preflight the merged deployment without starting it:

```text
docker compose --env-file <private-alpha.env> \
  -f deploy/compose.self-hosted.yml \
  -f deploy/compose.private-alpha-paperclip.yml config --quiet
```

For managed cloud, replace the first profile with
`deploy/compose.managed-cloud.yml`. The merged configuration contains only the
credential file path, never the credential value. The adapter re-reads that
file for each upstream request, so an operator can atomically replace a revoked
key without rebuilding or restarting Company OS.

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
7. Open Governance → Agent Connectors and confirm the installed Federated
   Source shows its declared inventory/Work capabilities and retained
   `HEALTHY` last-check state. This view does not make a new upstream request.
8. Confirm external execution ownership, management depth, source return links
   and accountable-human mappings in Agents and Work.
9. Confirm no Issue description, adapter config, external user/run/session ID,
   raw response, credential or private log appears in responses, events or logs.
10. Revoke/rotate the sandbox key and confirm sync fails without changing prior
   portfolio state; restore a fresh key and repeat.

The retained source health is process-local observability, not proof of current
upstream availability. It starts as `NOT_CHECKED`, becomes `HEALTHY` after a
successful synchronization, and becomes `UNAVAILABLE` after a failed one while
retaining only bounded timestamps. Restarting the API resets it to
`NOT_CHECKED`. No raw Paperclip error or credential is retained.

## Current stop condition

The retained authenticated acceptance proves real official Agent and Issue API
reads, neutral inventory/Work projection, anonymous denial, short-lived board
key use, and fail-closed `401` behavior after revocation. The earlier
`local_trusted` exercise remains useful for stable-replay and exact bounded-field
coverage, but is not used as authentication evidence. All temporary credentials
and local sandbox state were removed after the authenticated exercise.

Do not mark this connector production-ready or private-Alpha live until a
customer-owned non-production Paperclip URL, company ID, Agent mappings and
credential file are available and the complete sequence above has retained
sanitized evidence through the OIDC-protected Company OS formal route. Do not
use production Agent data or a personal credential for Alpha admission. See
`docs/acceptance/2026-08-27-paperclip-federated-connector-sandbox.json` and
`docs/acceptance/2026-08-27-paperclip-federated-connector-authenticated.json`.
The current-workspace boundary is retained separately in
`docs/acceptance/2026-08-28-paperclip-local-trusted-alpha.json`.
