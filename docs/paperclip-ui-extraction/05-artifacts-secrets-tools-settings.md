# Paperclip UI extraction: artifacts, secrets, tools and settings

Status: rendered-page and source/API extraction complete; Company OS adaptation in progress.

## Evidence pin

- Upstream checkout: `213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`
- Upstream tag: `v2026.817.0`
- License: MIT (reference only; no page code is copied)

Existing valid captures reused:

- `docs/audits/2026-08-20-paperclip-page-atlas/reference/desktop-artifacts.png`
- `docs/audits/2026-08-20-paperclip-page-atlas/reference/mobile-artifacts.png`
- `docs/audits/2026-08-20-paperclip-page-atlas/reference/desktop-secrets.png`
- `docs/audits/2026-08-20-paperclip-page-atlas/reference/desktop-tools.png`
- `docs/audits/2026-08-20-paperclip-page-atlas/reference/mobile-tools.png`

## Route and source map

| Surface | Route | Primary source | API / supporting source |
|---|---|---|---|
| Company artifacts | `/artifacts` | `ui/src/pages/Artifacts.tsx` | `ui/src/api/artifacts.ts` |
| Secrets | `/company/settings/secrets` | `ui/src/pages/Secrets.tsx` and `pages/secrets/*` | `ui/src/api/secrets.ts` |
| Apps/connections | `/apps`, `/apps/connections`, `/apps/:connectionId/:tab` | `ui/src/pages/apps/*` | `ui/src/api/tools.ts` |
| Tool access profiles | `/apps/advanced/*` | advanced tools/profile pages | tool profile/policy/binding API |
| Company settings | `/company/settings` and child routes | `ui/src/pages/CompanySettings.tsx`, access/invites pages | company/access APIs |
| Instance settings | `/company/settings/instance/*` | general, environment, heartbeat, plugin and adapter pages | deployment-scoped APIs |

## Artifacts

- A server-side company projection flattens task documents, direct attachments and admitted work products.
- Search, media-kind filters, project filter, cursor pagination and task/parent-task grouping are URL-addressable.
- Group cards can expand into one task's artifact stack.
- Image/video/document/text/file previews use explicit fallbacks for broken or unsupported sources.

Company OS mapping: artifacts become admitted evidence or result assets with provenance, digest, work, Agent, accountable human and access classification. Raw attachments are not automatically evidence.

## Secrets

- Separates company secrets, each user's values, provider vaults and Agent-proposed bindings.
- Tracks status, managed/external mode, versions, provider configuration, coverage and usage bindings.
- Supports rotation, enable/disable/archive, provider health, remote import preview and access events.
- Agent proposals are human-reviewed and value-free in the review response.

Company OS mapping: the control plane stores references and configuration state only. Values remain behind `SecretBrokerPort`; leases are short-lived, scoped, audited and never appear in Connector commands, task records, evidence or Web projections.

## Apps, connections and tool access

- Distinguishes application definition, connection, runtime install, catalog entry, permission profile and binding.
- “Installed” and “permitted” are separate states.
- Connection health/reconnect, OAuth, catalog refresh and runtime health are explicit.
- Profiles have default action, ordered rules, risk selectors, target bindings, archive state and review for newly discovered tools.
- Access checking and gateway audit use server-side policy decisions.

Company OS mapping: Data Connector and Agent Connector are not conflated. Tool capability, installation, permission and runtime health remain separate projections. High-risk tool invocation still enters the exact approval pipeline.

## Settings

- Company identity/branding, members, invites and company lifecycle are distinct from instance/runtime settings.
- Environments, heartbeat defaults, plugins, adapters and experimental flags are deployment-instance concerns.
- Archiving is separated from ordinary editing and presented as a dangerous action.

Company OS mapping: company configuration stays tenant-scoped; deployment profile and infrastructure configuration stay outside the company domain. Managed-cloud and self-hosted use one codebase but separate adapters and lifecycle boundaries.

## Strong patterns retained conceptually

- Dedicated server projections instead of browser-side endpoint stitching.
- Structured empty/loading/error/partial-health states.
- Secret values never returned in list and review projections.
- Install, authorize and execute are separate lifecycle steps.
- Settings ownership follows company versus deployment scope.
- Every access decision and secret lease is auditable.

## What is not copied

- Paperclip page/components, brand, prose, shared types, database schema and API client.
- Secret values, provider credentials, private sessions or fixture data presented as production.
- Paperclip plugin/adapter identifiers as Company OS core concepts.
- A broad generic attachment library without Company OS evidence admission and responsibility provenance.
