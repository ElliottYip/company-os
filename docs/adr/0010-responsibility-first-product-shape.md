# ADR 0010: Responsibility-first Company System of Record

- Status: Proposed — awaiting user confirmation
- Date: 2026-08-19

## Context

The first-priority competitive audit found that Paperclip, AgentSpace,
StaffDeck and Provision already cover much of generic Agent orchestration, but
none makes mixed human/Agent organizational responsibility, exact action-bound
approval, data authorization and evidence lineage its canonical domain.
Commercial products separately cover registries, AI asset governance, vertical
workforces and managed FDE deployment, usually inside proprietary ecosystems.

## Proposed decision

Make Company OS a responsibility-first AI Native Company System of Record and
Agent Boss control plane. It owns organization, human and Agent principals,
responsibility contract revisions, work and attempts, authorization/data
contracts, exact approval subjects, evidence and outcomes. Vendor runtimes are
equal Connectors. The warm Web and renderer-neutral office are daily product
interfaces, not a replacement for durable control-plane semantics.

Do not position the product as a generic orchestration runtime or an SMB avatar
workforce. Those are implementation/reference and experience layers
respectively. Do not fork any audited competitor as the product base.

## Consequences if accepted

- Reuse proven execution, migration, Secret and plugin invariants behind
  Company OS-owned ports and schemas.
- Keep one canonical reference per non-differentiated capability and a separate
  provenance decision for any copied code.
- Add explicit `outcome_unknown`, attempt fencing, frozen capability snapshots,
  transactional outbox and Secret-access audit ordering to the architecture.
- Maintain the implementation freeze until the user accepts this ADR.

## Rejected alternatives

- Generic open-source Agent orchestration platform as the primary product.
- Warm SMB AI workforce/virtual office as the canonical domain.
- Competitor fork or runtime dependency as Company OS foundation.
