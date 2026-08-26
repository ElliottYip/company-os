# ADR 0017: Paperclip is the default engineering reference for generic product capabilities

Status: Accepted
Date: 2026-08-24

## Context

Company OS is an independent product and has no Paperclip runtime dependency,
but independence is not a reason to invent a second set of generic company,
membership, Agent, task, approval, or operational rules. Paperclip has already
implemented and tested many of those lifecycle decisions.

The product owner has directed that Paperclip's pinned source be the first
reference for these generic rules and for the surrounding engineering shape:
service and package boundaries, data lifecycle, migrations, failure recovery,
operational diagnostics, deployment, settings, onboarding, and administrative
workflows. Company OS should diverge only where its product charter requires a
distinct accountable-human, responsibility, data authorization,
Connector-neutral, deployment-profile, domestic-enterprise, FDE, or evidence
guarantee.

## Decision

For generic product capabilities, implementation begins by tracing the relevant
end-to-end path in Paperclip commit
`213dabab4f8e1f3bb1803a2924c0fea1289fcd4c` (MIT): schema, service, route, Web
interaction, failure/recovery path, deployment or operational boundary, and
focused tests. The resulting Company OS design is then:

1. adopted as an independently owned contract when it fits the product;
2. extended by the smallest explicit Company OS invariant when responsibility
   or enterprise data governance requires more; or
3. rejected with recorded code evidence when it conflicts with the charter.

Company OS must not create a parallel role matrix, membership lifecycle, invite
state machine, Agent work-eligibility state machine, approval lifecycle, or
error contract while an adequate Paperclip rule exists. Stable codes and
structured parameters are contracts; English UI strings are not.

This applies to every generic product surface, not only the current lifecycle
work. Before changing identity, company membership, permissions, invitations,
Agent configuration, goals, tasks, runs, budgets, approvals, secrets, adapter
health, recovery, settings, API ergonomics, migration discipline,
observability, deployment, upgrade, backup, or operator diagnostics, the
implementation note must identify the corresponding pinned Paperclip
schema/service/route/test or operational path. A new Company OS rule is
permitted only when the source has no adequate rule or when an explicit product
invariant requires a named extension.

Paperclip is a reference, not an authority that bypasses judgment. Each adopted
idea must still pass Company OS threat modelling, tenant isolation, stable-code
API, upgrade/rollback, and accountable-human tests. Architecture may be
re-authored; source may be copied only when its exact file, pinned commit,
license, local changes, and continuing maintenance owner are recorded. Similar
ideas from other audited products remain admissible, but each capability has
one named best reference to prevent a collage of incompatible lifecycle models.

Company OS remains independently buildable and deployable. It imports no
Paperclip package, internal type, database schema, service, UI component,
trademark, or asset. Adopted behavior is reauthored behind Company OS ports and
stored in Company OS-owned schema. Provenance records the exact source paths,
commit, license, local differences, and tests.

## Current lifecycle mapping

Paperclip's `active`, `paused`, `idle`, `running`, `error`,
`pending_approval`, and `terminated` statuses are the generic reference for an
Agent's admission and work eligibility. Company OS models them directly in its
own `AgentLifecycleRecord`; it does not overload responsibility-contract state.

- `active`, `idle`, `running`, and `error` are assignable and invokable;
- `paused` is assignable but not invokable;
- `pending_approval` and `terminated` are neither assignable nor invokable;
- termination is irreversible;
- a terminated Agent ancestor invalidates the reporting chain, while a paused
  Agent ancestor produces a warning rather than blocking assignment.

Responsibility-contract states (`DRAFT`, `ACTIVE`, `SUSPENDED`, and `ENDED`)
remain a separate Company OS state machine describing the authority and
accountability contract. Work eligibility requires both a valid responsibility
contract and an eligible Agent lifecycle; neither state machine substitutes for
the other.

Paperclip freezes pending Agent configuration and applies the approved snapshot
atomically on admission. Company OS preserves that behavior. Its additional
activation checks—an accountable human, exact high-risk approval rules, an
enabled equal Connector contract, and applicable data authorization—are
Company OS extensions and must be named as such rather than presented as
Paperclip behavior.

## Work and run mapping

Paperclip's durable `heartbeat_runs` record, serialized per-Agent start,
idempotent approval side effects, process-loss recovery, liveness evidence, and
bounded retry behavior are the generic reference for execution. Company OS
does not clone the heartbeat implementation because equal remote Connectors
cannot expose Paperclip's process/session internals. It preserves the same
operational invariants through the existing `WorkAttempt` state machine,
fenced leases, atomic event/outbox commit, explicit unknown-outcome
reconciliation, and evidence-backed terminalization.

Process-restart recovery follows Paperclip's scheduler shape: an unreferenced
timer starts an immediate scan, applies a bounded minimum interval, prevents
overlapping ticks, and isolates tenant failures. Company OS scans its own
durable Connector outbox instead of Paperclip heartbeat/process rows.

Run observation follows the same separation found in the pinned implementation:
ordered run events are not themselves terminal success; evidence/artifacts have
explicit references and provenance metadata; and the result is persisted only
when the fenced run finalizes. Company OS represents that through neutral
Connector observations, digest-backed evidence outputs, and a separate result
reference rather than adopting heartbeat `resultJson` or process/session data.

Generic Tool Access follows the pinned profile/entry/binding/policy vocabulary
and priority order. Company OS does not invent parallel role or grant names.
Its independent implementation remains tenant- and revision-bound, defaults to
deny, and routes `require_approval` into the stronger Company OS responsibility
binding. Catalog values whose runtime semantics are incomplete fail closed.

Generic usage accounting follows the pinned cost-event and budget-policy
vocabulary: integer cents, explicit unpriced records, company/Agent/project
scopes, and UTC-month or lifetime windows. Company OS adds a digest-bound
runtime usage reference and never derives a price from token counts when the
provider has not reported one.

The Company OS additions are the immutable authority snapshot on each attempt
(accountable human, responsibility revision, exact actions, permissions, data
authorizations, Connector capability digest) and secret-free Connector
publication. Those are explicit responsibility and runtime-neutrality
extensions, not replacement generic run rules.

## Relationship to earlier decisions

This ADR refines ADR 0009: capability ownership and runtime independence remain
unchanged, while Paperclip is now the default code-level engineering reference
for generic product capabilities. It does not revive the superseded ADR 0007
runtime-base decision and does not make Paperclip a deployment dependency,
schema owner, compatibility target, release train, or visible brand.

## Verification

- dependency and independence guards reject Paperclip product imports;
- focused tests bind each adopted behavior to a stable Company OS contract;
- `docs/source-manifest.md` records every adopted or copied behavior;
- implementation reviews identify the pinned Paperclip path or explain why a
  different single reference is stronger for that capability;
- deviations require an ADR or an explicit source-audit note.
