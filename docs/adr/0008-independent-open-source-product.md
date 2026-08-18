# ADR 0008: Company OS owns its complete open-source product stack

Status: Accepted  
Date: 2026-08-18  
Supersedes: ADR 0007

## Context

ADR 0007 selected Paperclip as the canonical generic-work substrate. The product
decision has changed: Company OS and Paperclip are peer products and potential
competitors. Requiring Paperclip would weaken independent deployment, make
Company OS inherit another product's schema and lifecycle, and blur ownership
of work, responsibility, data governance, and customer experience.

The existing Company OS core, ports, deterministic Demo, responsibility model,
Connector SDK, owned Web, deployment profiles, and Pre-3D contracts are already
independent and remain valid. The Paperclip HTTP adapter and compatibility train
were experiments based on the superseded premise.

## Decision

Company OS is the canonical owner of its complete Task, Goal, Run, Budget,
Artifact, Heartbeat, organization, responsibility, approval, evidence, model,
data, Connector, API, event, persistence, migration, Web, and deployment stack.
It must build, test, start, and run both deployment profiles without Paperclip
installed or reachable.

Paperclip is retained only as a fixed-SHA competitive code-audit subject. A
whole-project decision of **REFERENCE ONLY** does not prevent module-level
`ADOPT-CODE` or `ADAPT` decisions after code evidence and license review. Any
copied implementation becomes Company OS-owned source and must record:

- upstream repository, tag, full commit SHA, source file and license;
- destination file and substantive local modifications;
- verification and future maintenance owner;
- confirmation that no trademark, logo, EE/private source, database schema,
  internal type, private service, or brand asset was copied.

Company OS does not maintain Paperclip API compatibility, run an upgrade train,
merge its pages, or automatically follow releases. Later Paperclip releases are
periodic competitive radar inputs only.

## Enforcement

- `check-independent-runtime.mjs` rejects Paperclip references in all product
  runtime roots, package dependencies, scripts, and TypeScript build inputs.
- Paperclip experiments live below `research/paperclip` and are excluded from
  product type checking, tests, builds, service startup, and deployment.
- `audit-manifest.json` fixes the audited SHA and enforces per-module decisions
  and copied-code provenance.
- Company OS tests and API contracts cannot require a Paperclip service,
  database, DTO, token, plugin host, page, or event schema.

## Consequences

Company OS must implement and maintain more non-differentiated product
capability. It gains independent release control, a coherent domain model,
offline/self-hosted viability, a clean open-source boundary, and freedom to
serve Chinese enterprise and FDE use cases without upstream product coupling.

The retired adapter spike remains recoverable in research and Git history, but
is not a supported integration. A future generic connector to any peer product
would require a new ADR and must use the same neutral Connector contract as
Raft Agent, Codex, DeepSeek, and enterprise Agents.
