# Company OS roadmap

Dates and the 3–10 management ratio remain pilot hypotheses, not commitments.

## Current delivery order

### 0. Independent product reset and evidence-led competitive audit — complete

ADR 0008 makes Company OS the canonical owner of the complete product stack.
Remove Paperclip from runtime/build/deployment assumptions and enforce operation
with no Paperclip installation. Audit its fixed-SHA source as a competitor and
record per-module `ADOPT-CODE`, `ADAPT`, `REFERENCE ONLY`, or `REJECT` decisions;
do not create automatic compatibility or upgrade obligations.

ADR 0009 expands this into a development gate. Commercial research covers
Workday Agent System of Record, Microsoft Agent 365, ServiceNow AI Control
Tower, Salesforce Agentforce, Relevance AI Workforce, Sintra, Lindy,
Artisan/11x and OpenAI Presence. The completed first-priority code audits cover
AgentSpace, StaffDeck, Paperclip and Provision using fixed inventories and
representative critical paths. Tier-2 is paused. Every compared production
capability has one best reference plus a separate reuse/license boundary and a
single `GO/NARROW/PARTNER/STOP` judgment.

ADR 0010 accepts the responsibility-first Company System of Record + Agent Boss
shape. The audit freeze is lifted. Work resumes across the responsibility-first
control-plane capabilities below; generic work is admitted only when it supports
that architecture.

### A. Constitution and boundaries — complete

Product charter, ADRs, dependency rules, migration-manifest format, independent
build/configuration/data lifecycle, and source provenance.

### B. Independent scaffold and contracts — complete

Domain/application foundation and ports. Equal connector SDK with validation,
idempotency, versioning, timeout, cancellation, progress, approvals, evidence,
results, and runtime proof.

### C. Owned design system — complete

Raft-influenced Company OS tokens and accessible base components. Legally
tracked fish assets; no runtime imports from Raft.

### D. Deterministic demo runtime — complete

Zero-configuration event-driven demo company and three-minute assign → plan →
activity → approval → evidence/result → responsibility → reset loop, isolated
from production identity, models, tools, data, and secrets.

### E. Agent Boss MVP projection — runnable vertical complete

Organizations, principals, roles, human accountability, reporting lines, tasks,
risk/autonomy, approvals, evidence, and responsibility projections. Validate
rather than promise a 3–10 agent management span.
Work, responsibility, and accountable-human records are authoritative Company
OS data.
The application dispatch boundary enforces enterprise-human identity and a
revisioned responsibility contract before issuing an idempotent Company OS work
command; fixtures cannot write formal contracts.

### F. Model, data, tool, and usage boundary — formal vertical complete

Provider/session isolation, model switching, data authorization, connector
management, egress firewall, secure credential references (never raw secrets in
the control plane), Tool Access profiles/bindings/policies, verified cost events,
and revisioned company budget policies. External provider packages remain
optional; missing runtimes and unpriced usage fail closed rather than producing
invented activity or spend.

## Product phases

1. **Model/data foundation:** multi-vendor access, key security, provider
   isolation, switching, data authorization, plugin base, egress firewall, real
   connectors, authorization persistence, Web administration, security tests.
2. **Agent Boss MVP:** organizations, people, agents, accountable roles, tasks,
   progress, model/data permissions, approvals, work and responsibility records.
3. **Training/certification:** Agent Boss education, role management, human and
   agent capability certification. AgentBoss School v0.1 now includes an
   issuer-reviewed Foundations course credential and opt-in Yearbook; production
   issuance still requires the operational public-key/reviewer process.
4. **Enterprise pilots/templates:** validate ratios, boundaries, and cost before
   producing sales, support, finance, engineering, and industry templates.

## Quality gates for every phase

Focused unit/integration tests; E2E for complete flows; strict type checks;
production build; dependency guard; secret/production-data checks; demo labels;
production-mode isolation; and migration/provenance audit when applicable.
