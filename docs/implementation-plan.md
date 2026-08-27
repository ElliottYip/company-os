# ANC Agent Portfolio incremental implementation plan

Status: Active
Baseline: `v0.1.0-rc.5` / `5ce7173`
Primary spec: `docs/specs/agent-portfolio-vertical-slice.md`

## Delivery rule

Preserve the running Company OS foundations and deliver one tested vertical
slice at a time. Each behavioral increment starts with a failing test, stays
additive or rollback-friendly, and leaves existing Governed execution and
operations admissions working.

## Phase 0 — product and architecture gate

- [x] Update the product charter for Personal, Shared, and Federated Agents.
- [x] Accept ADR 0046 for management depth and execution ownership.
- [x] Record the retain/extend/migrate gap analysis.
- [x] Freeze success criteria, boundaries, commands, and task order in the spec.

Verification: document links resolve, `git diff --check`, no source or runtime
behavior changes.

## Phase 1 — neutral Portfolio contract

- Add Agent class, management depth, execution owner, external identity/source,
  visibility, and privacy-boundary types.
- Add truthful Connector data/control capabilities with v1 compatibility.
- Add a Portfolio projection that can show legacy Governed Agents unchanged.

Verification: focused core/SDK tests, typecheck, boundaries.

## Phase 2 — cross-source Work

- Add a neutral source envelope and Observed/Governed/Federated modes.
- Implement idempotent Observed registration without dispatch.
- Implement monotonic Federated directory/workspace/Work/Run/artifact sync
  without runtime proxying.
- Project legacy Work as Governed.

Verification: domain, application, event-store, HTTP, idempotency, tenant, and
no-dispatch tests.

## Phase 3 — commercial and credential governance

- Add idempotent external usage import and allocation dimensions.
- Add subscription, seat, quota, renewal date, and renewal request lifecycle.
- Add Token/credential reference status and expiry metadata without material.
- Bind real approvals only where policy requires one.

Verification: domain/application/API/projection tests plus Secret scan.

## Phase 4 — isolated exhibition Demo

- Create server-owned temporary Demo Sessions and deterministic Coral Labs
  portfolio fixtures.
- Add create/read/reset/recover routes that derive tenant from the session.
- Prove two visitors cannot observe or mutate one another.
- Keep formal administration, data, Secret, restore, and execution composition
  unreachable from Demo identity.

Verification: integration, concurrency, reset, failure-recovery, and security
boundary tests.

## Phase 5 — existing Web, new information architecture

- Reuse the current shell, tokens, Paperclip-inspired interactions, and i18n.
- Update Dashboard, Agents, Work, Approvals, Governance, and Usage & Billing.
- Add source return links, fixture labels, management-depth badges, privacy copy,
  sync state, commercial state, and responsibility gaps.
- Complete the three-minute guided Demo on desktop and tablet.

Verification: Web state tests, interaction checks, bilingual browser E2E,
accessibility/console/network inspection, concurrent sessions.

## Phase 6 — full admission and release preparation

- Run focused and full unit/integration/E2E, migration, type, build, boundary,
  independence, Secret, dependency, performance, backup/restore, and upgrade
  admissions.
- Add a public Demo deployment profile and on-site runbook.
- Prepare the next immutable candidate after RC5 (default RC6) and Hong Kong
  candidate steps without overwriting RC4/RC5 or prepare-only evidence.

Release publication, server mutation, DNS/TLS, real identity/data initialization,
and formal first start remain separate authorized operations.
