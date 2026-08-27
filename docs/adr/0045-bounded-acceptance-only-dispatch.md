# ADR 0045: Bounded acceptance-only dispatch

Status: Accepted

Date: 2026-08-27

## Context

ADR 0039 made planned maintenance durable, but its two-state model allowed only
all formal dispatch or no formal dispatch. Real first-start and upgrade
acceptance must exercise an Agent, model, governed data path, Secret lease, and
responsibility evidence before normal company work resumes. Temporarily opening
all dispatch for those checks would defeat the maintenance boundary.

The Acceptance Owner and Instance Administrator may be the same human. Their
actions still have different meanings: authorizing a bounded acceptance window
does not authorize normal dispatch, and confirming acceptance does not itself
authorize reopening normal dispatch.

## Decision

The instance maintenance state has three modes and one transition graph:

```text
OPEN -> DISPATCH_FROZEN -> ACCEPTANCE_ONLY -> OPEN
                                  |
                                  +------------> DISPATCH_FROZEN
```

Direct `DISPATCH_FROZEN -> OPEN` and `OPEN -> ACCEPTANCE_ONLY` transitions are
invalid. Every transition after the initial freeze remains bound to the same
opaque operation ID and must use a different authorization reference from the
preceding transition.

`ACCEPTANCE_ONLY` carries a bounded, secret-free binding:

- one opaque acceptance plan ID;
- one exact SHA-256 plan digest;
- one to 32 exact Company/Work ID pairs.

Normal work remains blocked in this mode. A formal dispatch is admitted only
when it declares the exact operation, plan, and acceptance authorization; its
Company/Work pair is allowlisted; and the initiating human is an Instance
Administrator. Company OS emits a production audit event containing those
references and the maintenance revision before creating the generic Work. It
does not persist credentials, provider sessions, prompts, outputs, or evidence
content in the maintenance state.

The same human may perform the Acceptance Owner and Instance Administrator
roles by default, but acceptance confirmation and dispatch reopening remain
separate commands, authorization references, and audit records. The customer
may assign the roles to different humans without changing the state machine.

PostgreSQL migration `0007_instance_acceptance_window` adds the binding to the
singleton and append-only event tables and constrains it to
`ACCEPTANCE_ONLY`. The HTTP adapter validates exact, bounded input before it
reaches the application layer. Demo mode is unchanged.

## Consequences

- Real acceptance can exercise the production execution path without admitting
  unrelated work.
- A healthy deployment, a structurally valid customer record, or an acceptance
  task result can never silently reopen dispatch.
- First start and later upgrades use the same maintenance semantics.
- Operators must retain distinct authorization evidence for freeze, acceptance
  activation, acceptance confirmation, and dispatch reopen.
- Rollback or rejected acceptance returns to `DISPATCH_FROZEN`; it never opens
  dispatch automatically.

## Alternatives rejected

### Temporarily set the instance to `OPEN`

Rejected because unrelated company work could race acceptance checks.

### Add an `isAcceptance` boolean to arbitrary Work

Rejected because a client-controlled label is not authority. Admission must be
bound to durable instance state and an exact allowlist.

### Require two different people

Rejected as an unconditional product rule because small self-hosted customers
may have one administrator. Separation of actions and evidence is mandatory;
separation of people remains configurable.
