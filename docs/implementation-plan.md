# Phase-one implementation plan

## Completed audit gate — product direction accepted

`docs/competitive-audit-charter.md`, ADR 0009 and the first-priority audit record
the completed decision phase. Paperclip, AgentSpace, StaffDeck and Provision
were audited at fixed pins through key modules and end-to-end critical paths;
commercial public boundaries were compared; Tier-2 is paused.

ADR 0010 accepts the responsibility-first Company System of Record + Agent Boss
direction. The old per-unit zero-gap gate is archived evidence, not a delivery
blocker. One best reference remains assigned per compared capability; no
competitor becomes a shared runtime owner.

The audit freeze is now lifted. Resume only work that advances mixed human/Agent
responsibility, exact approval/evidence, data contracts, neutral Connectors,
Agent Boss, independent Web/FDE templates or Pre-3D contracts. Formal 3D asset
production remains frozen.

## Architecture gate — independent open-source product

- ADR 0008 makes Company OS the canonical owner of Task, Goal, Run, Budget,
  Artifact, Heartbeat, persistence, API, event, Web, and deployment behavior.
- `npm run check:independence` must pass without Paperclip installed, reachable,
  or referenced by a product runtime root.
- Paperclip is a fixed-SHA competitive audit subject only. Module-level reuse
  requires code evidence, an explicit decision, and copied-code provenance.
- Existing neutral core, responsibility, data, Connector, Demo, Web, and Office
  work remains valid and must not be rewritten around competitor internals.

## Slice 0 — provenance and specification

- Record assumptions, success criteria, commands, structure, and boundaries.
- Audit source HEAD, license, dependency declarations, worktree state, and visual
  candidates without modifying the source repository.
- Verification: source manifest contains paths, state, hashes, and license.

## Slice 1 — contracts before implementations

- Define domain connector/approval/event read models.
- Define identity, event/data store, agent execution, and approval publication
  ports with consistent result/error semantics.
- Add connector SDK envelope validation tests first, then implementation.
- Verification: focused tests and strict type checking pass.

## Slice 2 — application control-plane snapshot

- Write a failing unit test for equal connector presentation and fixture labels.
- Implement one read-only application use case using ports.
- Add in-memory fixture adapters and a boundary-only Raft Identity adapter.
- Verification: unit tests prove deterministic output; no forbidden inward
  dependency or vocabulary appears.

## Slice 3 — deployment profiles and host boundary

- Define `managed-cloud` and `self-hosted` adapter composition profiles.
- Add the standalone Web entry and a narrow `mountCompanyOS` host contract.
- Ensure the host supplies a mount element/config only and cannot own use cases.
- Verification: profile tests, boundary scan, and standalone Web build pass.

## Slice 4 — owned visual layer

- Copy only the approved fish PNGs and Apache license.
- Adapt the audited Company OS token/button subset into owned CSS with a
  prominent modification notice.
- Build accessible, responsive fixture dashboard components.
- Verification: hashes match the manifest and Vite includes assets in output.

## Slice 5 — final gates and handoff

- Run tests, boundary check, type check, and production build via one command.
- Complete architecture, directory, deployment, provenance, and migration docs.
- Recheck source repository status to prove it was not changed by this task.
- Verification: `npm run verify` exits zero and source status matches audit.

## Risks and mitigations

- **Uncommitted visual provenance:** record exact hashes and status; retain the
  Apache license; flag legal confirmation before external redistribution.
- **Vendor leakage:** scan import graph and forbidden vocabulary in inward layers.
- **Competitor drift:** no compatibility promise; periodically reassess useful
  capabilities and implement them on Company OS terms.
- **Demo mistaken for live:** fixture identifiers and visible labels are required
  by both tests and UI copy.
- **Premature 3D scope:** exclude all scene and 3D directories and dependencies.
