# Raft neutral core reception report

Reception date: 2026-08-18  
Source HEAD: `b4701e28726e9a53837a4b5744ee2b867acd264a`  
Company OS implementation commits: `d02f89b`, `7cb05ad`

## Source-to-target acceptance

| Raft source | Company OS target / replacement | Verification |
|---|---|---|
| `company-os/src/core/controlPlane.ts` + test | `core/control-plane.ts`, boundary guard, snapshot/Demo tests | opaque IDs, neutral events/status, fixture provenance |
| `company-os/src/core/organization.ts` + test | `core/organization.ts`, `tests/neutral-core-reception.test.ts` | company/departments/humans/agents, valid references, accountable human |
| `company-os/src/core/responsibility.ts` + test | `core/responsibility.ts`, reception tests | exactly one contract/agent, critical-action approval, escalation backup |
| staged `company-os/src/core/work.ts` + test | `core/work.ts`, reception tests | responsibility/runtime resolution, allowed action, initiator, cycle checks |
| `company-os/src/ports/identityPort.ts` | `ports/identity-port.ts` | neutral identity/authorization plus default edge adapter test |
| `company-os/src/ports/companyEventStorePort.ts` | `ports/event-data-store-port.ts` | append/read contract plus isolated fixture reset |
| `company-os/src/ports/agentRuntimePort.ts` | `ports/agent-execution-port.ts` | health, capabilities, pause/resume/cancel/evidence, timeout, runtime proof |
| `company-os/src/ports/approvalPort.ts` | `ports/approval-publication-port.ts` | exact action/digest/work/contract/agent/human/evidence/result binding |
| `company-os/src/index.ts` | root `index.ts` and owned barrels | independent public surface |
| `company-os/scripts/check-boundaries.mjs` | `scripts/check-boundaries.mjs` | inward import direction plus forbidden dependency scan |
| `company-os/docs/independence-audit.md` | ADR 0001/0003/0005, `docs/architecture.md`, `docs/migration-plan.md` | decisions preserved and expanded |

Source package/config/README files were scaffolding rather than portable domain
behavior; they are replaced by Company OS-owned `package.json`, TypeScript/Vite
configuration, README, contributor rules, and docs.

## Validation results

`npm run verify` completed successfully after reception:

- 20 focused tests passed, 0 failed/skipped.
- Dependency guard: inward layers vendor-, transport-, and UI-neutral.
- TypeScript strict type check: passed.
- Vite 8.2.1 production build: passed; 10 modules transformed.
- Standalone dev server: started in 61 ms and returned HTTP 200.
- Raft source HEAD and scoped worktree status matched the pre-copy audit after
  completion; this task issued no source write, reset, stage, or commit command.

## Unreceived source status

No file in the formal neutral-core handoff remains unreceived. The staged,
uncommitted `work` candidate was explicitly reviewed, adapted, and tested; its
source status remains recorded as staged rather than misrepresented as a commit.

Raft-specific implementations were intentionally **not** received into core.
They remain required adapter contracts, listed below.

## Safe Raft top-level cleanup scope

After the Raft owner verifies this report/commits, the following top-level
extraction seam can be removed from Raft. This report authorizes no deletion by
the Company OS task itself.

```text
company-os/README.md
company-os/docs/independence-audit.md
company-os/package.json
company-os/scripts/check-boundaries.mjs
company-os/src/adapters/README.md
company-os/src/application/README.md
company-os/src/core/controlPlane.test.mjs
company-os/src/core/controlPlane.ts
company-os/src/core/organization.test.mjs
company-os/src/core/organization.ts
company-os/src/core/responsibility.test.mjs
company-os/src/core/responsibility.ts
company-os/src/core/work.test.mjs
company-os/src/core/work.ts
company-os/src/index.ts
company-os/src/ports/agentRuntimePort.ts
company-os/src/ports/approvalPort.ts
company-os/src/ports/companyEventStorePort.ts
company-os/src/ports/identityPort.ts
company-os/src/web/README.md
company-os/tsconfig.json
```

No other Raft path is included in the cleanup signal.

## Adapter contracts Raft must preserve

- `crates/buzz-acp/`, especially `src/company_connector.rs` and its runtime,
  session, vault, pause/resume/cancel/evidence behavior.
- `crates/buzz-core/src/agent_action_approval.rs`,
  `crates/buzz-core/src/agent_connector.rs`, `crates/buzz-core/src/company.rs`,
  and event-kind/schema mapping in `crates/buzz-core/src/kind.rs`.
- `crates/buzz-relay/` ingest, validation, projection, approval, publication,
  and persistence behavior used by the Raft adapter.
- `web/src/features/company-os/`, `web/src/app/routes/company.setup.tsx`,
  `web/src/app/routes/company.tsx`, `web/src/app/routes/connectors.tsx`, and
  related temporary route/mount integration until a narrow host adapter lands.
- `web/src/shared/lib/nostr-client.ts`, `nostr-signer.ts`, `relay-url.ts`, and
  formal-mode identity protection as Raft-side adapter concerns.
- Compatibility mapping for event kinds 30179–30189, 30624–30627, and 46021;
  `snake_case`; `schema_version`; external public-key identity; and secret-free,
  short-lived runtime attestation.

## Cleanup signal

`SAFE_TO_CLEAN_RAFT_COMPANY_OS`

This signal applies only to the exact top-level `company-os/` files above and
does not authorize deletion of Web, ACP, core-adapter, or relay implementation.

