# Active-goal completion audit — 2026-08-26

Status: **NOT COMPLETE — source candidate qualified, external acceptance pending**.

This audit evaluates the active product goal against the current repository and
external deployment evidence. It does not treat a passing fixture, an
unpublished commit, or a prepared-but-not-started host as production proof.

## Exact implementation baseline

- Last code-bearing commit:
  `e4bf9af33a88d7bd4f0d0c43c71cc01e0a845f4a`. A documentation-only successor
  may become the pull-request head; the eventual release manifest must bind its
  own exact source SHA rather than inheriting this coordinate.
- Pull request: `ElliottYip/company-os#1`, draft, not merged.
- GitHub Actions qualification:
  `https://github.com/ElliottYip/company-os/actions/runs/32960311842`, success,
  exact head SHA above.
- Published release status: no release points to this commit. The historical
  five-image `v0.1.0-rc.3` is retained as evidence but is
  `SUPERSEDED_FOR_START` because it has no Reference Data Node image.
- Candidate image contract: six product images — API, Web, operations, Codex
  Agent Node, Vault Broker, and the fixture-only Reference Data Node.

## Requirement-by-requirement evidence

| Active-goal requirement | Authoritative repository evidence | Current judgment |
|---|---|---|
| Independent open-source runtime | `scripts/check-independent-runtime.mjs`, boundary guard, Apache-2.0 admission, and CI qualification run above | **Repository complete.** No Paperclip runtime, schema, service, or package dependency. |
| Real service and database migrations | Ordered PostgreSQL migrations, migration/runtime-role split, restore and 16→17 admissions in CI | **Repository complete; deployment incomplete.** Neither target has initialized the new candidate database. |
| Multi-tenant enterprise identity and permission | Better Auth/OIDC composition, membership and invite stores, Keycloak and two-user negative-permission browser admissions | **Reference vertical complete; customer acceptance pending.** No real staging OIDC has been provisioned or accepted. |
| Company, human, Agent, goal, project, Work, Attempt, budget, and Secret-reference lifecycle | Formal application services, PostgreSQL event/outbox stores, revision-fenced HTTP commands, Web flows, and focused lifecycle tests | **Repository vertical complete.** Real Secret material remains correctly outside the repository and has not been injected. |
| Vendor-neutral Connector execution and recovery | Connector SDK, installed-package loaders, durable outbox, observation ordering, fencing, pause/resume/cancel, outcome-unknown reconciliation, Codex driver, and three-node synthetic admission | **Reference vertical complete; customer-node acceptance pending.** The Reference Data Node is a deterministic fixture and is not a real enterprise connector. |
| Exact approval, evidence, and responsibility | Exact-action binding, accountable-human decision, digest-only evidence, accountability export, restart recovery, and formal browser admission | **Repository vertical complete; external handling acceptance pending.** |
| Data authorization and export governance | Revisioned grants, default-deny egress, HTTP Data Node client, durable preparation references, and raw-data exclusion tests | **Reference vertical complete; real enterprise test source pending.** |
| Complete self-service Web | Company-first onboarding, all accepted navigation surfaces, formal API client, English/Chinese switch, mobile/keyboard/state-matrix and no-dead-control gates | **Repository vertical complete; deployed browser acceptance pending.** |
| Managed-cloud and self-hosted | One-codebase Compose profiles, separate migration/runtime identities, live profile admissions, non-root images, exact runtime configuration | **Repository complete; six-image release and target-host acceptance pending.** |
| Upgrade, backup, recovery, and observability | PostgreSQL minor/major upgrade gates, parallel rollback, encrypted streaming backup/restore, bounded metrics/logs, soak and resilience tests | **Repository complete; customer-controlled backup target and two actual release upgrades pending.** |
| Full quality gate | Local `npm run verify`: 527 tests, 523 passed, four explicit external skips, zero failures; 15 browser cases passed and four external cases skipped. The formal PostgreSQL restart admission additionally passed 3/3 consecutive runs. CI run above completed all live infrastructure gates successfully. | **Candidate source qualified.** This is not release, deployment, or customer-acceptance evidence. |

## External state proved at this audit

- Hong Kong and Hangzhou 7 remain `PREPARED_NOT_STARTED`.
- RC3 artifacts and prepare-only evidence are retained; RC3 is not eligible for
  first start.
- No Company OS Secret, runtime container, network, volume, database, OIDC,
  Vault, DNS, TLS, Nginx, or security-group change was made for the six-image
  candidate.
- The eight startup Secret files and the separate opt-in backup Secret set
  remain intentionally absent.

## Remaining completion sequence

1. Obtain explicit authorization to merge the draft pull request and publish a
   new immutable six-image release candidate.
2. Verify all six content-addressed images, manifest, SBOM, provenance, and
   release bundle in Hong Kong and Hangzhou 7; repeat prepare-only on both.
3. Obtain a separate exact first-start authorization, then create each
   environment's isolated runtime objects, inject restricted-file Secrets,
   migrate, provision, and start without DNS cutover.
4. Complete real OIDC, Vault/Broker, Agent Node, Data Node, model Provider,
   restart/recovery, responsibility-chain, and Web acceptance in staging.
5. Prove encrypted backup and restore against the customer-controlled off-site
   target.
6. Complete two actual immutable release upgrades with parallel rollback
   evidence.
7. Keep Hong Kong active until the independent ICP/DNS cutover gate is
   authorized; do not infer cutover authority from technical acceptance.

The active goal must remain open until every remaining item has direct,
current-run evidence.
