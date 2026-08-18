# ADR 0009: Evidence-led capability sourcing

- Status: Accepted
- Date: 2026-08-18

## Context

Company OS is an independent open-source competitor, but independent ownership
does not justify rebuilding solved infrastructure without evidence. Conversely,
copying attractive fragments from many products produces conflicting domain
models, duplicate lifecycle owners, uncertain licenses, and an unmaintainable
architecture.

## Decision

Freeze overlapping generic Agent-management development while the competitive
audit defined in `docs/competitive-audit-charter.md` is open.

For every production capability, select one canonical best reference after
commercial comparison and code-level open-source audits. The reference informs a
separate `ADOPT-CODE`, `ADAPT`, `REFERENCE ONLY`, or `REJECT` implementation
decision. Company OS always owns the public contract, responsibility semantics,
data lifecycle, deployment boundary, and exit path.

Legal reuse requires an exact repository URL, complete commit SHA, source file,
license and notice obligations, copied-file hash, local modifications, and tests.
No runtime dependency on competitor private services, enterprise-only features,
database schemas, internal types, brands, or assets is permitted.

## Consequences

- Existing differentiated Company OS work remains valid.
- Generic capability expansion waits for the audit gate.
- Paperclip is one Tier-1 subject, not the presumed base or privileged source.
- A capability matrix must reject multiple co-owners even when several projects
  contain useful implementations.
- New evidence may change internal architecture, but cannot silently weaken
  accountable-human, responsibility, data-authorization, or deployment rules.
- Version observation is periodic competitive research, not upstream merge or
  compatibility duty.

## Rejected alternatives

- Adopt one competitor wholesale before proving product and responsibility fit.
- Copy the best-looking implementation from each repository without a single
  capability owner.
- Rely on README and product marketing instead of code/schema/history evidence.
- Continue implementing overlapping systems while the comparison remains open.
