# Company OS roadmap

Dates and the 3–10 management ratio remain pilot hypotheses, not commitments.

## Current delivery order

### 0. Upstream admission and Paperclip bridge

Paperclip is the single generic work-substrate upstream under ADR 0007. Freeze
duplicate Task/Goal/Run/Budget/Artifact/Heartbeat development. Clear dependency,
migration, isolated-test and compatibility gates before production admission;
then integrate through published Plugin/API contracts and `GenericWorkPort`.

### A. Constitution and boundaries

Product charter, ADRs, dependency rules, migration-manifest format, independent
build/configuration/data lifecycle, and source provenance.

### B. Independent scaffold and contracts

Domain/application foundation and ports. Equal connector SDK with validation,
idempotency, versioning, timeout, cancellation, progress, approvals, evidence,
results, and runtime proof.

### C. Owned design system

Raft-influenced Company OS tokens and accessible base components. Legally
tracked fish assets; no runtime imports from Raft.

### D. Deterministic demo runtime

Zero-configuration event-driven demo company and three-minute assign → plan →
activity → approval → evidence/result → responsibility → reset loop, isolated
from production identity, models, tools, data, and secrets.

### E. Agent Boss MVP projection

Organizations, principals, roles, human accountability, reporting lines, tasks,
risk/autonomy, approvals, evidence, and responsibility projections. Validate
rather than promise a 3–10 agent management span.
Generic work records come from the admitted Paperclip adapter; responsibility
and accountable-human records remain authoritative Company OS data.
The application dispatch boundary enforces enterprise-human identity and a
revisioned responsibility contract before issuing an idempotent Paperclip
command; fixtures cannot write formal contracts.

### F. Model and data boundary

Provider/session isolation, model switching, data authorization, connector
management, egress firewall, and secure credential references (never raw
secrets in the control plane).

### G. Office Compiler Pre-3D

Spatial modules, entity/state model, deterministic layout compilation, and
replaceable renderer/asset contracts independent of 2D DOM.

### H. 3D production (explicitly later)

Reusable characters, rooms, furniture, rigs, actions, renderer, and asset QA,
only after Pre-3D contracts and the product loop are validated.

## Product phases

1. **Model/data foundation:** multi-vendor access, key security, provider
   isolation, switching, data authorization, plugin base, egress firewall, real
   connectors, authorization persistence, Web administration, security tests.
2. **Agent Boss MVP:** organizations, people, agents, accountable roles, tasks,
   progress, model/data permissions, approvals, work and responsibility records.
3. **Virtual office:** finish spatial compilation/Pre-3D semantics before 3D
   characters, furniture, actions, and renderer.
4. **Training/certification:** Agent Boss education, role management, human and
   agent capability certification.
5. **Enterprise pilots/templates:** validate ratios, boundaries, and cost before
   producing sales, support, finance, engineering, and industry templates.

## Quality gates for every phase

Focused unit/integration tests; E2E for complete flows; strict type checks;
production build; dependency guard; secret/production-data checks; demo labels;
production-mode isolation; and migration/provenance audit when applicable.
