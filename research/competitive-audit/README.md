# Competitive audit workspace

This directory implements the audit gate in
`docs/competitive-audit-charter.md`. Source checkouts under
`work/upstream-audit/` are read-only evidence and are not Company OS runtime or
build dependencies.

## Rules

- `targets.json` is the identity registry. A similarly named repository is not
  admitted until its official ownership is proven.
- Every admitted open-source target is pinned by full commit SHA and license.
- `inventories/*.json` are generated from `git ls-files`; all tracked paths are
  classified and assigned to an auditable unit.
- `assessments/*.json` is the eventual unit-completeness surface. A repository
  cannot be called fully audited while a unit remains `PENDING`.
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

`complete` intentionally fails until every admitted repository unit has all
required fields and all named repositories have resolved identities.
