# Active-goal completion audit — updated 2026-08-27

Status: **NOT COMPLETE — the exact Draft PR #3 head is qualified; merge, later
RC, first start and customer acceptance remain pending**.

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
- Draft PR `ElliottYip/company-os#3` remains unmerged. Its exact head
  `93ea16d57b14978c8c4efc6afaecd64a64c40606` passed GitHub Actions run
  `33045823187` on 2026-08-27. The run completed the full independent gate,
  real Keycloak, PostgreSQL backup/restore and least privilege, authenticated
  encrypted backup, bounded HTTP recovery, verified TLS, real Vault AppRole/KV
  v2, PostgreSQL 16 rollback and 16→17 migration, plus self-hosted and
  managed-cloud Compose admissions. The same run also proves that the real
  Keycloak gate no longer relies on collision-prone fixed host ports. This is
  qualified source, not a release or target-host execution.

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
| Upgrade, backup, recovery, and observability | PostgreSQL minor/major upgrade gates, parallel rollback, encrypted streaming backup/restore, bounded metrics/logs, soak and resilience tests; PR #3 adds candidate-scoped dependency/runtime materialization, hardened stable ingress, explicit route/observation/promotion, canonical active-pointer adoption, dynamic restart/status, digest-bound upgrade acceptance handoff, and a durable `ACCEPTANCE_ONLY` maintenance window. Acceptance dispatch is limited to an exact plan digest and Company/Work allowlist. Independent acceptance confirmation and normal-dispatch reopening use separate authorization references and audit records; rejection returns to `DISPATCH_FROZEN`. | **Repository upgrade and acceptance-control vertical complete through independently confirmed dispatch disposition; customer-controlled backup target and two actual release upgrades pending.** |
| Full quality gate | Exact PR #3 head `93ea16d…` passed local `npm run verify`: 661 tests, 657 passed, four explicit external skips, zero failures; 15 browser cases passed and four external cases skipped. The real Keycloak compatibility test also passed locally after the dynamic-port hardening. GitHub run `33045823187` then passed every repository, identity, database, backup, Vault, TLS, upgrade and both deployment-profile steps against the same SHA. | **Post-RC4 source candidate qualified.** This is not a merge, immutable release, deployment or customer-acceptance claim. |

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
  migration/provision, product-start, restart, upgrade preparation, traffic,
  rollback and acceptance-handoff executors. It also contains a revision-fenced
  acceptance maintenance lifecycle that opens only an exact allowlist, binds an
  independent decision without changing runtime state, and performs a separate
  accepted/rejected dispatch disposition. Draft PR #3 is source-qualified but
  unmerged and **not** retroactively attributed to immutable RC4. A structural
  handoff alone still keeps `acceptanceClaimed=false`,
  `independentlyVerified=false`, and `dispatchReopened=false`.

## Remaining completion sequence

1. Obtain explicit merge/release authority for already-qualified Draft PR #3,
   publish a later immutable six-image RC, verify it content-by-content on both
   sites, and repeat prepare-only without replacing or mutating RC4 evidence.
2. Obtain a separate exact first-start authorization, then create each
   environment's isolated runtime objects, inject restricted-file Secrets,
   migrate, provision, and start without DNS cutover.
3. Complete real OIDC, Vault/Broker, Agent Node, Data Node, model Provider,
   restart/recovery, responsibility-chain, and Web acceptance in staging.
4. Prove encrypted backup and restore against the customer-controlled off-site
   target.
5. Execute the qualified bounded acceptance lifecycle after first start and
   each upgrade: activate the exact Work allowlist, bind the independently
   verified decision, then separately reopen dispatch or return to frozen. The
   same human may hold both roles, but the authorization references and audit
   records must remain distinct.
6. Complete two actual immutable release upgrades with parallel rollback
   evidence.
7. Keep Hong Kong active until the independent ICP/DNS cutover gate is
   authorized; do not infer cutover authority from technical acceptance.

The active goal must remain open until every remaining item has direct,
current-run evidence.
