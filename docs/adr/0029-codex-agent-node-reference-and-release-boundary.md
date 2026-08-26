# ADR 0029: Codex Agent Node uses stable vendor CLI and selective Paperclip engineering references

Status: Accepted
Date: 2026-08-26

## Context

Company OS needs a real Codex execution path without moving credentials,
provider sessions, prompts, outputs, or private reasoning into the control
plane. ADR 0017 already makes the pinned Paperclip source the default
behavioral reference for generic control-plane rules, while ADR 0028 makes the
customer Agent Node the only owner of model inference.

The relevant Paperclip baseline is tag `v2026.817.0`, commit
`213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`, MIT. Existing audit evidence was
reused; the repository was not rescanned. Representative code paths were:

- `packages/adapters/codex-local/src/server/execute.ts` and its focused tests;
- `packages/adapters/codex-local/src/server/codex-home.ts`;
- `packages/adapters/codex-local/src/server/output-inactivity-monitor.ts`;
- `packages/adapter-utils/src/server-utils.ts`;
- `server/src/services/heartbeat-run-summary.ts`;
- `server/src/services/heartbeat-stop-metadata.ts`;
- `server/src/services/heartbeat.ts` usage normalization and recovery paths.

Paperclip is mature in process containment, lifecycle diagnostics, bounded
output, recovery and usage handling, but its heartbeat rows, adapter sessions,
environment namespace, prompts and product types are Paperclip-owned concepts.

## Decision

Company OS independently implements the following engineering invariants:

1. The vendor adapter is a separate execution-plane component with its own
   authentication, workspace and state directory.
2. Prompts enter through stdin, never process arguments.
3. Child environments use an allowlist; Company OS bearer tokens and unrelated
   host credentials are not inherited.
4. Execution has a bounded timeout, explicit terminal states and process
   termination. A later side-effecting driver must add process-group escalation,
   inactivity evidence and durable provider-native resume before advertising
   those capabilities.
5. Raw JSONL, vendor session IDs and private output stay local. The control
   plane receives bounded summaries, verified usage totals, opaque references
   and digests.
6. Reported cost and token usage remain distinct. Company OS never invents a
   price from token counts when a provider did not report one.
7. The exact Agent Node image and Codex CLI version are part of the signed
   release manifest and both upgrade-cycle plans.

The first driver uses `@openai/codex@0.144.1` and the documented stable
`codex exec` surface with JSONL, stdin, an output schema, ephemeral execution
and a read-only sandbox. OpenAI's experimental App Server is not used in this
release. Official contracts:

- `https://learn.chatgpt.com/docs/developer-commands?surface=cli`
- `https://learn.chatgpt.com/docs/app-server`

No Paperclip code is copied. Paperclip remains an architecture and behavior
reference under ADR 0017, not a runtime, schema, release train or canonical
owner.

## Company OS extensions

- Every executable Attempt freezes the accountable human, responsibility
  contract, exact action set, permissions, data authorizations and Connector
  capability digest.
- High-risk resume consumes an exact human approval; a generic process restart
  is not approval.
- Secret access uses an opaque, short-lived Broker grant bound to the Attempt.
- Enterprise data access and export remain behind the Data Node and egress
  firewall.
- Raft Agent, Codex, DeepSeek and enterprise Agents expose the same neutral
  Agent Node protocol.

## Consequences

- Paperclip's generic lifecycle and recovery mechanisms continue to be checked
  before Company OS invents equivalent behavior elsewhere.
- Company OS can replace Codex CLI or the whole Codex driver without migrating
  core/application data.
- A real staging acceptance still requires Vault grant redemption, a dedicated
  minimal `CODEX_HOME`, provider invocation, evidence/usage ingestion, terminal
  lease revocation and restart recovery. A local read-only inference proves the
  driver contract only; it is not staging or production acceptance.
