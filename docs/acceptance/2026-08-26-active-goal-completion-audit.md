# Active-goal completion audit — updated 2026-08-27

Status: **NOT COMPLETE — RC4 target prepare-only passed; first start and customer acceptance pending**.

This audit evaluates the active product goal against the current repository and
external deployment evidence. It does not treat a passing fixture, an
unpublished commit, or a prepared-but-not-started host as production proof.

## Exact implementation baseline

- Pull request `ElliottYip/company-os#1` is merged. Its merge commit and the
  exact RC4 source revision are
  `b9e58335eabab94de94b528b4cdb8834cf8faeae`.
- The immutable annotated tag `v0.1.0-rc.4` resolves to that commit. The public
  prerelease is <https://github.com/ElliottYip/company-os/releases/tag/v0.1.0-rc.4>.
- The protected qualification and publish workflow
  <https://github.com/ElliottYip/company-os/actions/runs/33028743993> completed
  successfully. It published six independently attested images: API, Web,
  operations, Codex Agent Node, Vault Broker and the fixture-only Reference
  Data Node.
- The downloaded release manifest digest is
  `sha256:375cdbd5abfc5196e01ee8abbfb67925153783ee4203f1f6b9611616e0802389`;
  the CycloneDX SBOM digest is
  `sha256:aa780403607fd0d60d339faa55f12500f55899d78285f941c3ec755a0c5ce137`.
- The historical five-image `v0.1.0-rc.3` remains immutable and retained as
  evidence, but is `SUPERSEDED_FOR_START` because it has no Reference Data Node
  image.

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
| Managed-cloud and self-hosted | One-codebase Compose profiles, separate migration/runtime identities, live profile admissions, non-root images, exact runtime configuration and the immutable six-image RC4 release | **Repository and release complete; target-host acceptance pending.** |
| Upgrade, backup, recovery, and observability | PostgreSQL minor/major upgrade gates, parallel rollback, encrypted streaming backup/restore, bounded metrics/logs, soak and resilience tests | **Repository complete; customer-controlled backup target and two actual release upgrades pending.** |
| Full quality gate | Current `npm run verify`: 529 tests, 525 passed, four explicit external skips, zero failures; 15 browser cases passed and four external cases skipped. The formal PostgreSQL restart admission additionally passed 3/3 consecutive runs. RC4 qualification completed the live OIDC, database, backup, Vault, TLS, resilience, upgrade and both deployment-profile gates. | **Release source qualified.** This is not deployment or customer-acceptance evidence. |

## External state last proved to this audit

- Hong Kong active and Hangzhou 7 standby remain `PREPARED_NOT_STARTED`.
- Both sites completed content-level verification of all six RC4 images and
  installed versioned RC4 release, site-contract, and evidence candidates.
  Compose rendering, Secret-free lint, path/permission checks, site isolation,
  and non-mutating doctor all passed. Neither site created a Company OS
  container, network, volume, startup Secret, database, IdP, or Vault runtime.
- RC3 artifacts and prepare-only evidence are retained; RC3 is not eligible for
  first start.
- The RC4 target admission did not authorize or perform Company OS Secret
  injection, runtime creation, database initialization, OIDC/Vault
  provisioning, DNS, TLS, Nginx or security-group changes on either target.
- The eight startup Secret files and the separate opt-in backup Secret set
  remain intentionally absent.
- The source after RC4 now contains separately authorized dependency,
  migration/provision, product-start, and acceptance-handoff executors. These
  changes are under qualification in Draft PR #3 and are **not** retroactively
  attributed to immutable RC4. Structural acceptance binding can produce only
  `ACCEPTANCE_RECORD_BOUND_PENDING_EXTERNAL_VERIFICATION`; it cannot claim
  customer acceptance.

## Remaining completion sequence

1. Finish Draft PR #3 qualification, publish a later immutable six-image RC,
   verify it content-by-content on both sites, and repeat prepare-only without
   replacing or mutating RC4 evidence.
2. Obtain a separate exact first-start authorization, then create each
   environment's isolated runtime objects, inject restricted-file Secrets,
   migrate, provision, and start without DNS cutover.
3. Complete real OIDC, Vault/Broker, Agent Node, Data Node, model Provider,
   restart/recovery, responsibility-chain, and Web acceptance in staging.
4. Prove encrypted backup and restore against the customer-controlled off-site
   target.
5. Complete two actual immutable release upgrades with parallel rollback
   evidence.
6. Keep Hong Kong active until the independent ICP/DNS cutover gate is
   authorized; do not infer cutover authority from technical acceptance.

The active goal must remain open until every remaining item has direct,
current-run evidence.
