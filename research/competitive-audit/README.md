# Competitive audit workspace

This directory implements the audit gate in
`docs/competitive-audit-charter.md`. Source checkouts under
`work/upstream-audit/` are read-only evidence and are not Company OS runtime or
build dependencies.

## Current completion model (2026-08-19)

The active first-priority decision audit is intentionally **module and
end-to-end-chain based**, not a zero-pending-unit exercise. It covers Paperclip,
AgentSpace, StaffDeck and Provision. The generated inventories remain the
repository coverage manifests, while `first-priority-architecture-audit.md` is
the completion authority for the current phase.

Paperclip's fixed-SHA fine-grained evidence is frozen as a trusted appendix:
704 of 1,560 units are complete and 856 remain pending. Those pending units are
not a gap against the current decision gate and will not be pursued merely to
clear a counter. AgentSpace, StaffDeck and Provision use representative critical
code evidence across the required architecture surfaces.

Tier-2 projects and the previously broadened discovery list are `PAUSED`; they
are neither rejected nor silently treated as audited.

## Rules

- `targets.json` is the identity registry. A similarly named repository is not
  admitted until its official ownership is proven.
- Every admitted open-source target is pinned by full commit SHA and license.
- `inventories/*.json` are generated from `git ls-files`; all tracked paths are
  classified and assigned to an auditable unit.
- `assessments/*.json` preserves fine-grained evidence but is no longer the
  completion gate for this product-shape phase.
- Marketing pages can support the commercial matrix but never substitute for
  source evidence in an open-source audit.
- `ADOPT-CODE` still requires a separate copied-code provenance record. An
  inventory or positive assessment does not authorize copying by itself.
- A completed fixed-SHA unit is carried forward across goal changes and is not
  reread unless its pin changes or its evidence is invalidated. Partial reads
  remain pending and resume from the unverified path or range.
- `DISCOVERY_IN_PROGRESS` and `PUBLIC_ARCHITECTURE_ONLY` are explicit gaps, not
  repositories that the inventory generator may silently skip at completion.
- Commercial/public product research is maintained separately from source-code
  evidence and cannot close an open-source unit.

## Commands

```text
npm run research:competitors:inventory
npm run research:competitors:inventory:check
npm run research:competitors:complete
```

`complete` retains the old exhaustive-gate behavior for historical verification;
it is expected to fail under the narrowed audit and must not be presented as the
current phase gate.
