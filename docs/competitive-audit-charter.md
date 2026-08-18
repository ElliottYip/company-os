# Competitive and open-source audit charter

Status: Independent active goal and implementation gate
Effective: 2026-08-18

## Active goal replacement

Company OS product implementation and Pre-3D delivery are no longer the active
goal. Before any large-scale implementation resumes, Company OS must complete an
independent market and source-code audit and the user must confirm a product
direction. The independent-product constitution in ADR 0008 remains a constraint,
but no product shape, upstream strategy, fork strategy, differentiation thesis,
or decision to continue is assumed in advance.

The audit evaluates every product against the Company OS product charter:
independent open source, mixed human/Agent organizations, accountable humans,
responsibility contracts and evidence, enterprise data authorization and egress
control, equal multi-vendor connectors, Chinese enterprise delivery, FDE-led
pilots, managed-cloud/self-hosted deployment, and a warm living-company product
experience.

## Development freeze

Until the audit gate closes, do not expand generic implementations of Agent,
Goal, Task, Run, Budget, Artifact, Heartbeat, scheduling, runtime management,
generic approval, generic observability, plugin hosting, or connector lifecycle.
Existing correct independent boundaries, responsibility semantics, deterministic
Demo, design system, and Pre-3D contracts remain in place and are not deleted or
rewritten.

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

The original tier list remains admitted evidence. The new first batch broadens
the zero-unexplained-gap audit to:

- AgentSpace
- StaffDeck
- Paperclip
- OpenSpawn
- Org Studio
- Agent Compiler
- SynthOrg
- OpenWorker
- Provision

Runtime/plugin and Company-as-Code references also require complete repository
classification plus code-level tracing of every Company OS-relevant path:

- DeepSeek Harness
- Cordis
- CompozyOS
- SmythOS SRE
- Juggler
- BeanOS Blueprint and any linked public implementation

Previously admitted tier-2 projects remain in scope and must still cover all
first-party modules:

- Symphony
- AgentArea
- HumanLayer ACP
- Agent Room
- OpenWorker
- Agent Control
- Mesa

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

At this goal transition, Paperclip has 103 complete units and 1,457 pending
units at `213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`. The other admitted repository
inventories exist, but their module assessments remain pending. This is the
continuity baseline, not a claim of full audit completion.

Repository identity is not inferred from a project name. Before auditing, record
the official repository URL, owner, license, stable tag when one exists, full
commit SHA, default branch, retrieval date, and why the identity is unambiguous.
If several projects share a name, mark discovery unresolved rather than auditing
the wrong repository.

Each audit covers all first-party code and packages; database schema and every
migration; APIs and events; plugins and adapters; execution and recovery;
identity, permission, human collaboration and approval; secrets and audit;
deployment and cloud code; Web and mobile behavior; tests, fixtures and quality;
configuration; architecture documents; and commit/release history. Third-party,
vendored, generated, binary asset, fixture, patch, and lock-file surfaces are
classified explicitly and never silently omitted.

## Evidence and completeness contract

Every repository receives a generated tracked-path inventory and auditable-unit
coverage table. Every first-party unit must record:

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

The zero-gap gate fails for an unknown unit, duplicate assessment, source-SHA
drift, stale generated inventory, missing required field, or unexplained path.
README-only findings cannot close a code-audit unit.

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
- Tier-1 and Tier-2 repository identity/provenance manifests.
- Per-repository full coverage checklist and completeness proof.
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

The audit phase is complete only when every named commercial product has all
required dimensions or an explicit evidence limitation, every named open-source
repository has an unambiguous pinned identity and zero unexplained first-party
coverage gaps, every production capability has one best reference, all copy
decisions include license/provenance boundaries, and the resulting architecture
adjustments are accepted in ADRs.

Only after the reports are complete and the user confirms one product direction
may overlapping generic Agent-management or Pre-3D implementation resume.
