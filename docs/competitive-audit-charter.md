# Competitive and open-source audit charter

Status: Completed; direction B accepted and implementation gate released
Effective: 2026-08-18

## Completed goal record

This charter governed the independent market and source-code audit that preceded
further product delivery. The product owner accepted direction B on 2026-08-19;
ADR 0010 now defines the responsibility-first product shape. ADR 0008 remains
the independent-product constitution.

The audit evaluates every product against the Company OS product charter:
independent open source, mixed human/Agent organizations, accountable humans,
responsibility contracts and evidence, enterprise data authorization and egress
control, equal multi-vendor connectors, Chinese enterprise delivery, FDE-led
pilots, managed-cloud/self-hosted deployment, and a warm living-company product
experience.

## Development freeze transition

During the audit gate, do not expand generic implementations of Agent,
Goal, Task, Run, Budget, Artifact, Heartbeat, scheduling, runtime management,
generic approval, generic observability, plugin hosting, or connector lifecycle.
Existing correct independent boundaries, responsibility semantics, deterministic
Demo, design system, and Pre-3D contracts remained in place. The gate is now
closed: responsibility-first implementation may resume, while formal 3D assets
remain excluded.

Allowed work during the freeze is audit infrastructure, read-only source
inspection, provenance and license records, threat/data-model analysis,
Company-OS-specific constitutional fixes, and repairs needed to keep existing
verification green.

## Commercial scope

The commercial matrix must cover at least:

- Workday Agent System of Record
- Microsoft Agent 365
- ServiceNow AI Control Tower
- Salesforce Agentforce
- Relevance AI Workforce
- Sintra
- Lindy
- Artisan and 11x
- OpenAI Presence

For each product, record dated primary evidence for target customer, core
objects, accountable-human semantics, Agent lifecycle, governance, deployment,
pricing/packaging, FDE or implementation service, and product entry point.
Unknown, undisclosed, preview-only, inferred, and unavailable facts must remain
explicitly marked; marketing claims are not implementation evidence.

## Open-source scope and depth

The active first-priority scope is exactly Paperclip, AgentSpace, StaffDeck and
Provision. Each receives one fixed SHA or tag, license record and generated
tracked-path inventory, followed by a deep module and end-to-end chain review of
domain, database, API/events, execution, Connector/plugin, identity/permission,
approval, Secrets, deployment, Web, tests and upgrade behavior.

Representative critical code proves architecture conclusions. The current gate
does not require every tracked file to be reread, every inventory unit to become
complete, per-file hashes, or every upstream test to run independently.

Symphony, AgentArea, HumanLayer ACP, Agent Room, OpenWorker, Agent Control and
Mesa are paused. All other previously discovered candidates are also outside the
active gate. Their inventories remain evidence and are not deleted, rejected or
silently counted as completed.

Names are discovery prompts, not repository identities. A project stays
`DISCOVERY_IN_PROGRESS` until an official owner/repository relationship is
proven. A public blueprint without an implementation is classified as public
architecture research, never as a completed code audit.

## Review continuity

Previously completed fixed-SHA audit units are carried forward and are not read
again merely because the active goal changed. Their evidence remains reviewable
and may be invalidated only by a pin change, a detected evidence defect, or a
cross-cutting contradiction. Partially read files and sampled ranges do not
become complete units; they resume at the first unverified path or range.

At the current scope transition, Paperclip has 704 complete units and 856 pending
units at `213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`. These 704 units are a trusted
appendix. They are not reread, discarded or expanded merely to clear all 1,560
units. The current completion authority is the four-project key-module report.

Repository identity is not inferred from a project name. Before auditing, record
the official repository URL, owner, license, stable tag when one exists, full
commit SHA, default branch, retrieval date, and why the identity is unambiguous.
If several projects share a name, mark discovery unresolved rather than auditing
the wrong repository.

Each first-priority audit covers the major first-party packages and representative
critical paths for database schema/migrations, APIs/events, plugins/adapters,
execution/recovery, identity/permission, human collaboration/approval, Secrets,
audit, deployment/cloud, Web/mobile, tests, configuration and release history.
Generated inventories account for third-party, generated, binary, fixture and
lock-file surfaces without requiring code-level review of each such file.

## Evidence and completeness contract

Every first-priority repository receives a generated tracked-path inventory and
a key-module coverage table. Each required architecture surface records:

1. audit status and exact source evidence;
2. function and design rationale;
3. inbound/outbound dependency direction;
4. key data models and persistence owner;
5. lifecycle, failure, recovery, upgrade and deletion behavior;
6. tests present, important omissions, and test quality;
7. the Company OS problem it may solve;
8. fit with the product charter and any responsibility conflict;
9. license and provenance implications; and
10. final judgment.

The gate fails for source-SHA drift, missing required architecture surfaces,
README-only conclusions, absent license identity, or an unexplained product
judgment. Fine-grained `PENDING` units do not fail this narrowed gate.

## Decision vocabulary

Code-level judgments are:

- `ADOPT-CODE`: legally copy a bounded, high-quality implementation into
  Company OS ownership with source SHA, file provenance, license notice, local
  modifications, tests, and no runtime coupling.
- `ADAPT`: re-express a sound implementation pattern behind Company OS contracts;
  copied portions, if any, still require provenance.
- `REFERENCE ONLY`: learn from the design or failure mode without copying code.
- `REJECT`: do not adopt because of quality, security, license, architecture, or
  product-responsibility conflict.

Product-level strategy is separately classified `GO`, `NARROW`, `PARTNER`, or
`STOP`; a strong module does not imply adoption of the product architecture.

## One canonical reference per capability

For each production capability the final matrix names exactly one best reference
source, selected by code evidence, product fit, maturity, security, license,
patch burden, and exit cost. Other products may appear as comparison or rejected
alternatives but cannot become co-owners of the same capability. A best reference
is not automatically a dependency or a code-copy decision.

Company OS remains canonical owner of its domain semantics, public contracts,
data lifecycle, Web experience, deployment profiles, and roadmap. No copied
implementation may import a competitor's private service, enterprise edition,
database schema, internal type graph, trademark, logo, or unauthorized asset.

## Required deliverables

- Commercial feature and strategy matrix with dated source evidence.
- Four first-priority repository identity/provenance manifests.
- Per-repository key-module coverage checklist and representative evidence.
- End-to-end capability and dependency maps.
- Data model, migration, lifecycle, recovery and deletion analysis.
- Security, identity, permission, approval, secret and audit analysis.
- Test, maintenance, commit and release maturity analysis.
- Legally reusable code ledger and license obligations.
- Designs worth learning from without copying, and prohibited copy surfaces.
- Conflicts with Company OS responsibility and deployment principles.
- Important problems competitors solve that Company OS had not yet modeled.
- A single-best-reference matrix and `GO/NARROW/PARTNER/STOP` decision per item.
- Architecture ADRs describing any Company OS changes caused by the evidence.
- A recurring competitor/release radar with refresh, drift and provenance rules.

## Gate closure

The audit phase is complete when every named commercial product has all required
dimensions or an explicit public-evidence limitation; all four first-priority
repositories have a fixed identity, key-module architecture review and judgment;
every compared capability has one best reference; license/copy boundaries are
explicit; and at least three mutually exclusive product shapes plus a final
recommendation are delivered.

The reports are complete and direction B is confirmed. Responsibility-first
Agent-management and Pre-3D implementation may resume under ADR 0010; generic
work without a direction-B consumer and formal 3D asset production remain out
of scope.
