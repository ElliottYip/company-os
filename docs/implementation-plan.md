# Phase-one implementation plan

## Architecture gate — upstream core selection

- ADR 0007 selects pinned Paperclip as the only generic work substrate.
- Do not add production Task/Goal/Run/Budget/Artifact/Heartbeat implementations
  to the current scaffold.
- First clear dependency, isolated upstream test, migration/rollback and Company
  OS bridge contract gates in `docs/upstream-adoption-plan.md`.
- Existing neutral core, responsibility, data, Connector, Demo and Office work
  remains valid and must not be rewritten around Paperclip internals.

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
- **Two-codebase drift:** profiles compose ports only; no domain/application fork.
- **Demo mistaken for live:** fixture identifiers and visible labels are required
  by both tests and UI copy.
- **Premature 3D scope:** exclude all scene and 3D directories and dependencies.
