# Company OS competitor audit execution plan

Status: active  
Effective date: 2026-08-18  
Goal: **Company OS 竞品全量代码审计、架构比较与产品形态决策**

## Decision freeze

This phase produces research only. It does not choose Paperclip as a base, choose
an independent rewrite, confirm a plugin-first thesis, confirm a digital-job or
workforce-runtime thesis, add product slices, copy large upstream code surfaces,
or enter 3D production. Existing correct Company OS boundaries are preserved.

## Evidence continuity: do not reread completed work

- Paperclip pin: `v2026.817.0` / `213dabab4f8e1f3bb1803a2924c0fea1289fcd4c` / MIT.
- Paperclip inventory: 4,464 tracked paths, 1,560 auditable units.
- Carried forward: 103 `COMPLETE` units and their committed evidence batches.
- Still open: 1,457 `PENDING` Paperclip units.
- A partially read aggregate, including the Recovery main service, remains
  pending; already read files/ranges are recorded as continuity notes and will
  not be reread, while unread ranges still must be covered before completion.
- Ten previously admitted competitor repositories already have fixed-SHA
  inventories. Their assessments remain pending and start from those inventories,
  not from README discovery.

## Audit project register

### Product/control-plane competitors

| Project | Current identity state | Required depth |
|---|---|---|
| Paperclip | confirmed and pinned | zero-gap whole repository plus UI-to-database critical paths |
| AgentSpace | confirmed and pinned | zero-gap whole repository |
| StaffDeck | confirmed and pinned | zero-gap whole repository |
| Provision | confirmed and pinned | zero-gap whole repository |
| OpenWorker | confirmed and pinned; license text missing | zero-gap whole repository; no code copy |
| OpenSpawn | official product found; repository pin pending | zero-gap after identity and license verification |
| Org Studio | official product found; repository pin pending | zero-gap after identity and license verification |
| Agent Compiler | candidate repository found; ownership proof pending | zero-gap if identity is confirmed |
| SynthOrg | candidate repository found; BUSL constraints require verification | zero-gap, source-available kept separate from open source |

### Runtime, plugin and Company-as-Code references

| Project | Current identity state | Required depth |
|---|---|---|
| DeepSeek Harness | official repository candidate found; exact pin pending | whole-repository inventory and runtime/plugin call chains |
| Cordis | official package metadata points to `cordiverse/cordis`; pin pending | framework lifecycle, isolation and plugin ownership |
| CompozyOS | official repository candidate found; beta pin pending | daemon state, permissions, sessions, events and extension boundaries |
| SmythOS SRE | official product/package points to `SmythOS/sre`; pin pending | runtime/API/provider/storage abstractions and license map |
| Juggler | official repository found; split AGPL/Apache license map pending | session document, approvals, plugins, headless/mobile and deployment |
| BeanOS Blueprint | public blueprint confirmed; linked code not yet established | public architecture audit; code audit only for proven linked repositories |

### Previously admitted comparison set

Symphony, AgentArea, HumanLayer ACP, Agent Room, Agent Control, and Mesa remain
in scope. They already have fixed-SHA inventories and are not rediscovered.

### Commercial/public product boundary research

Workday Agent System of Record, Microsoft Agent 365, ServiceNow AI Control
Tower, Salesforce Agentforce, Relevance AI Workforce, Sintra, Lindy, Artisan,
11x, and OpenAI Presence are reported separately from source-code audits. Only
dated official public evidence may support customer, object model, accountable
human, lifecycle, governance, deployment, packaging/pricing, FDE/implementation
service and product-entry claims.

## Ordered execution

1. **Governance and identity.** Extend the target registry, prove official
   ownership, pin full SHA/tag/license/date, classify source-available projects,
   and record projects with no public implementation.
2. **Coverage inventories.** Generate tracked-path, directory and package maps;
   explicitly classify first-party, third-party, generated, fixtures, assets,
   migrations, lockfiles and submodules.
3. **Paperclip deep audit.** Continue from the 103 completed units. Complete all
   pending units and trace each critical customer path through UI, API, service,
   schema/migration, authorization/audit and tests.
4. **First-batch repositories.** Complete product/control-plane repositories,
   then runtime/plugin and Company-as-Code references. No README-only closure.
5. **Commercial boundary audit.** Capture dated official evidence and preserve
   `unknown`, `undisclosed`, `preview`, and `inferred` as distinct states.
6. **Cross-project synthesis.** Build the capability matrix, data/lifecycle and
   dependency maps, maturity and license ledger, conflict register, and one
   canonical best reference per capability.
7. **Option space.** Produce at least three mutually exclusive Company OS
   directions with target user, recurring value, competitive coverage,
   defensibility, business model, risks and falsifiable market/technical tests.
8. **Decision gate.** Issue GO / NARROW / PARTNER / STOP recommendations and a
   final brief. Product implementation stays frozen until user confirmation.

## Completion proof

Completion requires exact pins/licenses for all public repositories, no
unexplained top-level or first-party module gaps, source-backed critical paths,
clear implemented/partial/UI-only/documented/roadmap/unmerged distinctions,
permanent links, validation evidence, a single best reference per capability,
and all required reports under `docs/research/`.
