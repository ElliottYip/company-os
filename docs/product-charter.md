# Company OS product charter

Status: Active product constitution  
Last updated: 2026-08-18

## Product thesis

Company OS is an independent AI Native Company operating system and control
plane. It is neither a Raft Agent feature nor a traditional agent-monitoring
dashboard. Agents can become colleagues, but cannot carry legal, business, or
organizational responsibility. Company OS therefore places humans, agents,
permissions, approvals, evidence, and responsibility chains inside one company
structure. A real employee acting as Agent Boss manages agents and remains
organizationally accountable for outcomes.

The working hypothesis is that one Agent Boss can safely manage roughly 3–10
agents. Enterprise pilots must validate this; it is not a promise or hard limit.

## Core product objects

1. Companies, departments, roles, projects, and workspaces.
2. Human identities, accountable human owners, agents, agent roles, and
   reporting relationships.
3. Equal multi-vendor connectors for Raft Agent, Codex, DeepSeek, and
   enterprise-owned agents. Raft Agent is optional.
4. Company data sources, data-authorization contracts, permission scopes, and a
   data-egress firewall.
5. Goals, task plans, tool activity, evidence, results, and complete
   responsibility records.
6. Autonomy and risk levels. High-risk actions pause for a matching human to
   approve or reject.
7. An Agent Boss workspace for assigning work, observing state, resolving
   approvals, reviewing evidence, and tracing anomalies and responsibility.
8. Future training/certification for Agent Bosses, human owners, roles, and
   agent safety, permission, and business capability.
9. Enterprise pilots that validate management ratios, automation boundaries,
   actual cost, and later industry templates.

## Responsibility is the primary product record

Every executable work item must answer who proposed the goal, which human is
accountable, which agent executed it, which permissions/data were used, who
approved each high-risk action, what evidence supports the work, and what the
result was. This responsibility chain is first-class, not a log attachment.

## First-run experience: deterministic Demo Mode

The highest-priority experience is a zero-configuration Demo Mode, comparable
to a real product test mode rather than a static tour. Without an account,
NIP-07, relay, model key, or production identity, a user enters a running demo
company.

The demo is deterministic and event-driven. It never calls a real model, relay,
MCP server, shell, filesystem, enterprise system, or paid API; creates no real
private key; and never mixes production data.

The target three-minute loop is inspect an agent's role/manager/permissions/
goal/state → assign a simulated task → observe plan/tool activity/evidence/
result → pause for high-risk approval → approve or reject → inspect the full
responsibility chain → reset in one action.

Demo cannot weaken production identity gates. Promotion may copy only a
sanitized organization template; identity, agents, permissions, and
responsibility contracts must be rebound.

## Virtual office and brand direction

Company OS should feel like a company at work, not a generic SaaS dashboard.
The system compiles organizations into an office-like space with department
rooms, cross-functional project rooms, meeting rooms, reception, pantry,
restroom, and corridors. Agent states include working, waiting, blocked,
awaiting approval, and complete.

Raft's three clay fish form the initial agent brand family; humans will receive
diverse, intentional clay-character choices. The experience is warm, alive,
playful, restrained, clear, and actionable—not generic AI gradients,
interchangeable card grids, or cheap cartoon avatars.

Reusable 3D assets, rigs, interactions, and action sequences are an explicit
future direction. The current Pre-3D phase defines spatial compilation, entity
state, and an `OfficeRendererPort` so business logic is not coupled to 2D DOM.
It does not implement Blender, GLB, Three.js, or 3D production.

Company OS owns its design tokens, base components, and legal asset copies.
Runtime imports from Raft are forbidden. Each copied asset records source,
worktree state, dependency, license, and hash.

## Deployment and identity constitution

One codebase produces `managed-cloud` and `self-hosted` profiles. Managed cloud
is product-operated for fast trials/SMBs. Self-hosted keeps data, credentials,
and execution in the customer environment. A hybrid cloud control plane plus
customer-local nodes is a likely direction, but core code assumes neither
connectivity nor Raft-operated cloud control.

Managed cloud may default to unified Raft Identity through `IdentityPort` and
standard OIDC/SSO boundaries. Product token audiences, permissions, and audits
remain separate: same account never means shared authority. Self-hosted may use
enterprise OIDC, SAML, or LDAP. NIP-07/Nostr belongs only in a Raft adapter.

The production product ultimately owns its frontend domain, backend service,
database schema, configuration, and data lifecycle. Raft Web may link or mount
through a narrow host contract and cannot own Company OS business logic.

## Architecture constitution

`core` and `application` never depend on Raft Agent, Buzz/Raft UI, NIP-07,
Nostr event kinds, a relay, model vendor, database, React, or browser runtime.

Replaceable ports cover identity; organization/principal directory; event/data
store; agent execution; model provider; data connector/egress; approval
publication; audit/evidence; and asset/office rendering. Raft/Nostr, Raft ACP,
Codex, DeepSeek, enterprise agents, cloud DBs, and local DBs are adapters only.

Connector contracts must evolve to express capabilities, identity binding,
health, task input, progress, approval pause/resume, evidence/result,
cancellation, timeout, idempotency, protocol version, and runtime proof. Vendor
sessions, credentials, secrets, and private reasoning never enter the control
plane.

## Migration discipline

Legacy Raft `company-os/` and related Web/ACP/Core changes are read-only
migration candidates, not a development location. Never move, delete, modify,
import, or depend on them. Neutral code may migrate after review. Raft/Nostr/
ACP/identity/Web mount code remains in Raft or an explicit Raft adapter. Nothing
is deleted until both sides build and verify independently.

## Current program boundary

Build the independent Pre-3D foundation, model/data boundary foundation, and a
runnable Agent Boss/Demo vertical slice. Defer certification, ACMM, paid-agent
calls, production data/credentials, and 3D asset production.

