# Local Agent test release

Status: implementation plan, 2026-09-04.

## Outcome

A signed-in Company OS administrator can start from a visible **Connect local
Agent** entry, understand whether the current deployment can reach a local
runtime, complete a secure connection without placing a bearer credential in
Company OS Web or company event data, register the discovered runtime, and see
an honest health result. The same entry remains visible in Demo and restricted
formal states, where it explains the exact next requirement instead of
disappearing.

This is the repository-controlled test-release gate. A hosted control plane
cannot dial a user's `localhost`; hosted laptop pairing therefore requires a
separate outbound Agent Bridge protocol. Until that protocol is implemented
and admitted, the product must label direct local connection as **self-hosted
or network-reachable only** and must not imply that a browser can bind a laptop
to `anc.raft.xin`.

## Product-readiness audit

The existing execution, identity, responsibility, approval, evidence, budget,
backup and release contracts are substantial. The missing P0 is the first-use
journey between those contracts:

1. The public front door has no Agent connection entry.
2. Demo and restricted-formal shells hide the connection surface completely.
3. Formal governance renders registration only after an operator has already
   installed and configured a runtime package.
4. An empty runtime list gives no actionable diagnosis or deployment-specific
   instructions.
5. The current server-to-node HTTP transport cannot reach a laptop behind NAT;
   the product does not disclose this boundary at the decision point.
6. There is no browser admission covering the zero-runtime, discovered-runtime,
   unhealthy-runtime and successfully registered states as one journey.

## Architecture decisions

- Keep credentials out of browser forms, URLs, company catalogs and events.
- Preserve `core <- ports <- application <- adapters/web`; connection guidance
  is a Web projection of adapter/runtime capability, not a vendor concept in
  `core`.
- Ship the direct-connection flow first for self-hosted and network-reachable
  Agent Nodes using the existing neutral HTTP Connector.
- Treat hosted laptop pairing as a separately flagged future transport. Do not
  fake it with a `localhost` URL entered into the hosted Web application.
- Make every unavailable state actionable and truthful; no invisible controls.

## Task 1: Visible connection entry and state model

**Acceptance criteria**

- The front door exposes **Connect local Agent**.
- Demo, restricted formal and formal workspace states all expose the same
  intent with state-specific next steps.
- Copy distinguishes self-hosted/network-reachable connection from hosted
  laptop pairing.

**Verification**

- Focused Web interaction and i18n tests pass.
- Browser snapshots cover English and Chinese desktop/mobile entry states.

## Task 2: Formal connection center

**Acceptance criteria**

- `接入与治理 -> Agent 接入` always renders a connection center.
- Zero-runtime state shows the exact package/configuration contract without
  showing or accepting secret values.
- Discovered runtimes show health, capability, residency and a clear register
  action; registered runtimes show their next Agent-admission step.

**Verification**

- Formal Web client fixtures cover zero, healthy, unhealthy and registered
  runtimes.
- The registration request remains revision-checked and contains no credential.

## Task 3: Operator preflight and setup handoff

**Acceptance criteria**

- A read-only command checks Codex binary/authentication, Agent Node
  configuration presence and reachability without printing secret material.
- The UI links to a copyable, non-secret command and explains where the secret
  must be injected.
- Success output is a bounded machine-readable record suitable for test-release
  evidence.

**Verification**

- Unit tests cover healthy, unavailable, unsafe and redaction cases.
- Existing real `npm run test:codex:local` admission remains unchanged.

## Task 4: End-to-end browser admission

**Acceptance criteria**

- A real browser can enter from the front door, reach connection guidance,
  inspect a discovered runtime, register it and see the registered state.
- Network requests have the expected method, path and secret-free body.
- Keyboard focus, accessible names and mobile layout pass.

**Verification**

- Focused Playwright tests pass with no console error.
- Screenshots are inspected at desktop and mobile widths.

## Task 5: Test release

**Acceptance criteria**

- Repository verification passes on the exact working tree.
- Release notes name the direct-connection boundary and hosted pairing gap.
- A test-release manifest, rollout checklist and rollback instructions are
  generated without claiming production acceptance.

**Verification**

- `npm run verify` passes, with external-environment skips explicitly listed.
- The built Web/API artifacts expose the intended release identity and health.

## Release boundary

This release may be called **Local Agent direct-connection test release** after
Tasks 1-5 pass. It may not be called hosted laptop pairing or production-ready
until an outbound Agent Bridge, customer-owned runtime evidence and the existing
customer acceptance gates pass.
