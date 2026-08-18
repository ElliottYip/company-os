# Paperclip whole-repository audit protocol

Status: active gate; Company OS large-scale implementation is frozen  
Pin: `v2026.817.0` / `213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`

## Purpose

Audit all tracked Paperclip material against the Company OS product charter,
not against a preselected feature list. Existing nine-module findings are
provisional depth notes. They do not close this gate until the repository-wide
coverage proof is complete.

The evaluation axes are:

1. actual responsibility, boundaries, dependency direction and lifecycle;
2. key schema/data and migration behavior;
3. test coverage, test quality and untested failure modes;
4. why the design exists and which operational failure it addresses;
5. whether Company OS has the same problem;
6. fit with independent open source, mixed human/Agent accountability, Chinese
   enterprise delivery, FDE templates, data authorization and warm Office UX;
7. legal direct reuse, independent adaptation, reference only or rejection;
8. conflicts with exact responsibility and approval semantics;
9. previously unknown problems Company OS must add to its architecture.

## Coverage proof

`repository-inventory.json` is generated from `git ls-files` at the exact pin;
`unit-assessments.json` is the review ledger whose unit IDs are mechanically
kept in exact correspondence with that inventory. Every tracked path receives both:
Every tracked path receives both:

- a classification: first-party source, test/eval/fixture, documentation,
  generated source, asset/binary, configuration/metadata, lockfile,
  third-party patch or vendored third party;
- an auditable unit covering a package, application area, service area, UI
  feature area or top-level repository area.

Third-party patches, generated source, assets, fixtures and the lockfile are
explicit records, not silent exclusions. Untracked `node_modules` is not source
content; dependency behavior is audited through manifests, lockfile, patches,
install/build scripts and vulnerability results.

The inventory guard fails if the checkout SHA drifts, a tracked path has no
unit, or the generated inventory is stale. Final completion additionally
requires every assessment unit to be `COMPLETE` and contain function,
dependency direction, data models,
lifecycle, test assessment, design rationale, Company OS problem/fit,
responsibility conflict, evidence and decision.

## Audit order

1. Repository governance, build graph, workspace/package graph and generated or
   third-party boundaries.
2. Database schema, migrations, portability, backup/restore and lifecycle.
3. Server API, identity, tenancy, authorization, work/runtime, approvals,
   Secrets, audit, events, import/export and Cloud behavior.
4. Plugin SDK, first-party plugins, sandbox providers, Agent adapters, MCP and
   tool integration.
5. CLI, configuration, deployment images, self-hosted/cloud release paths and
   operational recovery.
6. Web information architecture, local state, API use, realtime behavior,
   responsive/mobile behavior, accessibility, security and test quality.
7. Skills, evals, design/docs, release machinery and end-to-end workflows.
8. Cross-cutting capability map, dependency diagram, data lifecycle, reuse
   ledger, conflicts, unknown-problem register and Company OS adjustments.

No module receives a reuse decision solely because Paperclip implemented it,
and no implementation is excluded solely because Company OS already has a
different plan.

## Required outputs

- complete repository inventory and auditable-unit assessment;
- end-to-end capability map and architecture/dependency relationship;
- data model and lifecycle analysis;
- reusable-code candidates with exact provenance and license obligations;
- design patterns to adapt without copying;
- product and responsibility conflicts;
- a register of problems Paperclip solved that Company OS had not considered;
- required Company OS architecture adjustments;
- periodic competitive radar with no automatic merge, runtime dependency or
  compatibility obligation.

Only after all units are complete, the zero-gap guard passes, and the findings
are reconciled with the product charter may the implementation plan resume.
