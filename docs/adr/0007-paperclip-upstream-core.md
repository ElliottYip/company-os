# ADR 0007: Paperclip as the single generic work substrate

Status: Superseded by ADR 0008 on 2026-08-18. This file is retained as a
historical decision record and does not describe the current architecture.

Status: Accepted with production-admission gates  
Date: 2026-08-18

## Context

Company OS must minimize reimplementation and long-lived patches without
assembling overlapping domain models from many projects. The existing neutral
Company OS scaffold and differentiated responsibility/data/office contracts are
valid, but generic Task/Goal/Run/Budget/Artifact/Heartbeat work was paused while
ten upstream candidates were audited at code level.

The Paperclip compatibility spike used stable tag `v2026.817.0`, full commit
`213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`. Its generic capability score is
17.5/20 (87.5%) under the scoring rules in
`docs/upstream-capability-matrix.md`, above the 70% adoption threshold.

## Decision

Adopt Paperclip as the **only upstream owner of the generic work substrate**:

- company tenancy, generic agents and reporting;
- issue/task, goal, project and workspace records;
- runs, heartbeat scheduling, execution locks and recovery;
- generic budgets, artifacts, adapters and plugin infrastructure;
- generic board approvals, authentication/membership, secrets and audit;
- its database schema, migrations, API, CLI and operational release machinery
  for those capabilities.

Company OS will run Paperclip in its explicit API-only mode (`SERVE_UI=false` /
`uiMode: "none"`) and extend it through the published Plugin SDK and HTTP/event
APIs, with an external Company OS service and independently built customer Web.
It will not copy Paperclip domain source files, pages or page text into Company
OS and will not create a permanent fork. A narrow bridge plugin may project
opaque Paperclip IDs and events, but it is not a security boundary: Paperclip
documents that plugin UI is trusted, same-origin code and can call ordinary host
APIs. Paperclip's English UI may be enabled only on a separately protected
internal diagnostic/advanced-operations surface.

Paperclip is **not** the owner of Company OS differentiation:

- mixed human/Agent company structure and accountable-human assignments;
- typed responsibility contracts and complete evidence/result chains;
- exact high-risk approval binding to action/digest/work/contract/Agent/human/
  evidence/result;
- company data authorization contracts and the data-egress firewall;
- Agent Boss projections and management experience;
- managed-cloud/self-hosted Company OS policy and identity ports;
- deterministic Demo isolation and promotion sanitizer;
- Office Compiler, renderer/asset contracts, training/certification and Raft
  brand experience.

These remain canonical Company OS models. They reference Paperclip resources by
stable opaque external IDs and never by private database foreign keys.

## Production-admission gates

This decision authorizes an integration spike, not immediate production use.
The pinned tag must not be deployed until all gates pass:

1. A reproducible dependency audit has no unresolved critical or high finding
   in the admitted runtime graph, or each exception has a documented reachability
   analysis, compensating control, owner and expiry.
2. Upstream focused tests run with isolated writable home/log/database paths.
3. Company OS contract tests prove tenant isolation, accountable-human binding,
   exact approval digest matching, Connector pause/resume/cancel semantics and
   secret-free events.
4. Upgrade rehearsal verifies backup, forward migration, application rollback
   and data rollback/recovery on a disposable database.
5. The bridge uses only published Plugin/API contracts. Any required core patch
   triggers ADR reconsideration.
6. Company OS customer flows run with Paperclip UI disabled and require no
   translation or patching of Paperclip pages. Localization is not an adoption
   gate and is delivered under a future, separate goal.

The current base goal only preserves a language-neutral contract boundary:
stable codes and structured parameters, copy-independent functional tests, no
display copy in domain persistence, and original-language retention for user
input, Agent output, evidence, and logs. It does not require a Paperclip or
Company OS translation rollout. A future localization goal must keep English
and add switchable Chinese rather than replace source text.

The 2026-08-18 audit of the pinned lockfile reported 99 production dependency
advisories: 1 critical, 35 high, 53 moderate and 10 low. This is a release
blocker, not a reason to discard the otherwise strong architecture. The stable
tag also trailed current master by 176 commits and an 850-file diff within the
observed window, so tracking master is prohibited.

## Canonical owners

| Capability | Canonical owner |
| --- | --- |
| Generic task/goal/run/heartbeat/budget/artifact | Paperclip |
| Generic agent adapters and plugin lifecycle | Paperclip |
| Paperclip tenant auth, membership, secrets and DB migrations | Paperclip |
| Company organization, positions and accountable humans | Company OS |
| Responsibility/evidence contract and exact approval gate | Company OS |
| Data authorization and egress firewall | Company OS |
| Connector neutrality and runtime attestation | Company OS |
| Agent Boss, Demo and Office Compiler | Company OS |
| Raft identity/ACP/Nostr/Web mount | Raft-specific adapters only |

No other audited project may become a second production owner for these
categories without replacing this ADR.

## Upstream synchronization

- Consume stable tags only, pinned to a complete SHA.
- Use a 4–6 week stable-version train. Security, severe data-integrity and
  critical Connector fixes use a separately approved fast lane.
- Use one traceable mechanism: a separately versioned upstream checkout/image
  plus a checked-in lock manifest and bridge compatibility suite. Do not vendor
  selected source files.
- Review release notes and `HEAD(old)..HEAD(new)`; never merge `master` directly.
- Re-run license, dependency, migration, contract, backup/restore and E2E gates.
- Keep Company OS bridge commits replayable and prohibit changes under the
  upstream checkout.
- Generate API/schema/event/plugin diffs, run current and candidate-version
  compatibility suites, and update `docs/upstreams/paperclip-patch-ledger.md`.

## Exit strategy

Company OS ports and opaque external IDs are the anti-corruption boundary. To
replace Paperclip, implement a new generic-work adapter, dual-write only in a
bounded migration window, compare projections, freeze dispatch, export generic
work records and switch the adapter. Company OS responsibility, data and Office
records remain authoritative and require no domain rewrite. Connector identities
and capability contracts remain Company OS records; vendor sessions and secrets
are not migrated through the control plane. Rebind each Connector to the new
runtime adapter and replay sanitized progress/evidence events from the cutover
cursor.

## Alternatives

1. **Fallback: continue the existing self-owned neutral scaffold.** Use only if
   a production-admission gate cannot be met without invasive Paperclip patches.
   This preserves boundaries but forfeits the estimated 70–80% reduction in
   generic control-plane implementation and operations work.
2. **Permanent Paperclip fork.** Rejected because the observed upstream change
   rate makes a fork an expensive, security-sensitive patch queue.
3. **Combine Operant, Preloop, AgentGate, JamJet and Agent Room implementations.**
   Rejected because overlapping identity, approval, event and execution owners
   would create contradictory semantics and upgrade paths.

## Consequences for the current scaffold

- Keep existing Company OS differentiated core and ports; do not redo them.
- Freeze new generic Task/Goal/Run/Budget/Artifact/Heartbeat implementation.
- Treat existing generic fixture models as compatibility fixtures, not a second
  production system.
- Add a Paperclip bridge package only after the admission gates have executable
  contract tests.
- Do not create localization work in this adoption change or an upstream-page
  translation backlog. New upstream capability
  enters the Company OS Web only when a Company OS product slice needs a new
  projection or command.
- Use the audited `GenericWorkPort` anti-corruption boundary and the contract
  findings in `docs/upstreams/paperclip-headless-contract-audit.md`.
- Resume Pre-3D work on Demo, Agent Boss, data governance and Office contracts
  against Company OS ports while the generic substrate is integrated.
