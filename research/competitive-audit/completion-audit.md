# First-priority competitive audit completion proof

Date: 2026-08-19

Decision: direction B accepted by the product owner on 2026-08-19

## Requirement-by-requirement evidence

| Requirement | Authoritative evidence | Result |
| --- | --- | --- |
| Reuse existing evidence without rereading | Paperclip ledger retains 704 `COMPLETE`; README/protocol archive 856 pending without invalidation | Proven |
| Audit only four first-priority projects | `targets.json` active scope and `docs/competitive-audit-charter.md` | Proven |
| Pause all tier-2 projects | target paused scope, audit index and execution record | Proven |
| One SHA/tag/license/inventory per OSS project | generated inventories plus Paperclip repository inventory | Proven |
| Cover domain, DB, API/events, execution, Connector/plugin, identity/permission, approval, Secrets, deployment, Web, tests/upgrades | per-project sections in `first-priority-architecture-audit.md` with representative source evidence | Proven |
| Architecture diagram for each project | four Mermaid diagrams in `first-priority-architecture-audit.md` | Proven |
| Capability map, key data models and maturity | per-project capability/data/maturity sections | Proven |
| License, legal reuse and Fork judgment | fixed-version table, license section and final project judgment table | Proven |
| Commercial public-boundary research | `commercial-capability-matrix.md`, dated 2026-08-19, with official sources and explicit unknowns | Proven |
| One best reference per compared capability | single-source capability table in `first-priority-architecture-audit.md` | Proven |
| Company OS differentiation and prohibited copy boundary | license/copy section and product decision brief | Proven |
| At least three mutually exclusive product directions | directions A, B and C in `product-shape-decision-brief.md` | Proven |
| One GO/NARROW/PARTNER/STOP judgment per item | OSS final table and commercial decision table | Proven |
| Final decision and user confirmation | accepted ADR 0010 and decision record | Proven |
| No competitor runtime dependency or copied code | `check:independence`, provenance statement and empty copied-code decision | Proven |
| Product remains buildable/testable | verification commands below | Proven |

## Scope limitations that are not completion gaps

- Paperclip's 856 pending fine-grained units are outside the narrowed completion
  rule and remain explicit, not silently completed.
- AgentSpace, StaffDeck and Provision dependencies were not installed in their
  read-only checkouts. Test/CI quality was inspected, but upstream test success
  was not claimed.
- Commercial internal source, private schema, contracts, customer-specific
  pricing and undisclosed deployment/data details remain unknown.
- No competitor code was copied; therefore no copied-file provenance ledger
  entry is required for this phase.

## Verification record

The final repository verification must pass:

```text
npm test
npm run typecheck
npm run build
npm run check:boundaries
npm run check:independence
npm run check:research
npm run research:competitors:inventory:check
npm run security:secrets
git diff --check
```

The legacy commands `research:paperclip:complete` and
`research:competitors:complete` intentionally enforce the superseded exhaustive
protocol and are not current completion gates.

## Gate transition

The competitive-audit goal is complete. ADR 0010 lifts the research freeze and
admits responsibility-first implementation through the Pre-3D boundary. Formal
3D characters, scenes, rigs and animation remain excluded.
