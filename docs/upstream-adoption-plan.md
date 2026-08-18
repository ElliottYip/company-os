# Historical Paperclip adoption plan — superseded

Status: Superseded by ADR 0008 on 2026-08-18. This document is retained only as
decision history. None of its integration, cutover, compatibility, upgrade, or
runtime instructions are active.

## Recommended shape

Paperclip is a separately versioned, API-only generic-work service/Plugin Host.
Company OS is the accountability/data/experience service and independent Web
app. A narrow bridge uses Paperclip's official Plugin SDK and HTTP/event APIs.
Localization is deliberately outside this adoption goal.

```text
Company OS Web
  -> Company OS API (responsibility, data policy, exact approvals, office)
       -> GenericWorkPort
            -> Paperclip bridge -> pinned Paperclip service
       -> ConnectorPort -> Raft/Codex/DeepSeek/enterprise connectors
```

The bridge maps opaque IDs and sanitized events. It never reads Paperclip tables,
stores provider sessions or credentials, or grants authority based on plugin UI.
Paperclip runs with `SERVE_UI=false`. Its UI is not localized, branded or exposed
as the normal customer surface.

## Headless and localization verdict

- **Truly headless:** yes. `createApp` accepts `uiMode: "none"`; startup maps
  `SERVE_UI=false` to that mode, registers `/api` routes independently, and the
  startup banner explicitly reports `headless-api`.
- **Avoid forced repeat localization:** yes. Company OS consumes API, event and
  projection contracts only. No Paperclip page component or business copy is a
  customer dependency. Neither Paperclip nor Company OS translation coverage is
  a current admission requirement.
- **Long-term patch surface:** target zero upstream core patches. The current
  ledger is zero. One temporary infrastructure-only patch is the maximum before
  an ADR review; three consecutive train conflicts in one area force boundary
  redesign or downgrade to `REFERENCE ONLY`.

## Staged adoption

1. **Lock and admission:** check in the upstream manifest, dependency exceptions
   and exact SHA; clear critical/high runtime findings.
2. **Characterization:** add contract tests for tenant isolation, responsible
   human propagation, idempotency, pause/resume/cancel and event redaction.
3. **Read projection:** map Paperclip company/agent/issue/goal/run/artifact into
   Company OS read models without writes.
4. **Controlled dispatch:** create generic work only after Company OS data and
   responsibility contracts pass; high-risk execution remains paused at the
   Company OS Connector gate until exact approval succeeds.
5. **Dual verification:** compare existing deterministic fixture projections
   against Paperclip-backed projections; fixtures remain Demo-only.
6. **Cutover:** designate the Paperclip adapter as production `GenericWorkPort`;
   remove any duplicate production implementation only after backup and rollback
   rehearsal. Do not delete Company OS differentiated models.

Current implementation checkpoint: the neutral `GenericWorkPort`, strict
Paperclip issue/run-event DTO validation, opaque resource mapping contract,
stable error normalization, idempotent issue-create command, pagination, run
cancellation, and durable `afterSeq` event reads exist behind the adapter. They
are compatibility-spike code until live pinned-version, migration, backup, and
security admission gates pass; the application has not cut over to them.

Current locale work is limited to contract hygiene: stable machine codes,
structured arguments, copy-independent tests, and preservation of original
user/Agent/evidence/log text. A separate future active goal will add switchable
English and Chinese coverage.

## Allowed reuse

- Run Paperclip at the pinned upstream revision.
- Depend on published `@paperclipai/plugin-sdk` contracts.
- Call documented HTTP/event surfaces.
- Carry unmodified MIT notice for any distributed Paperclip software.

## Prohibited reuse

- Paperclip name, logo, screenshots or brand assets.
- Paperclip Page Components, route shells, business-copy catalogs or page state.
- Copy-pasted schema/services/UI components without history and notice.
- Private server imports, direct table access or assumptions about JSON columns.
- Paperclip session tokens as Company OS authorization.
- Same-origin plugin UI as an approval or identity security boundary.
- Upstream adapter credentials, raw sessions or private reasoning in Company OS.

## Estimated reduction

Paperclip covers 87.5% of the audited generic capability matrix. Conservatively,
adoption should remove 70–80% of new engineering for the non-differentiated work
substrate, and a larger share of migration/recovery/release test construction.
It does not reduce the differentiated Company OS scope.

## Upgrade and rollback

- Upgrade only stable tag to stable tag; store old/new tag, full SHA, lockfile
  digest and migration range.
- Export/backup both Paperclip and Company OS stores before migration.
- Run the compatibility suite and a disposable restore rehearsal.
- Application rollback may return to the previous Paperclip image only when its
  schema compatibility is proven. Otherwise restore the paired backup.
- Keep the bridge compatible with current and previous admitted stable versions
  during one release window.
- Run a 4–6 week version train; use a fast lane only for security, severe data
  integrity or critical Connector fixes.
- Test the Company OS Web against both the admitted and candidate Paperclip
  contract fixtures before promotion.

## Exit/replace

The `GenericWorkPort` contract and opaque mapping table are the seam. Export
Paperclip-owned records, import them into a replacement adapter, replay events,
compare Company OS projections and cut over. Responsibility and data contracts
remain in Company OS and are not migrated out of their canonical store.

The self-hosted mapping implementation stores one atomic, mode-0600 map per
Company OS company. Bindings are one-to-one within resource kind, idempotent,
tenant-scoped, corruption checked, and independently backup/restore tested.
Managed cloud must provide the same mapping contract in its own database. This
map is a first-class exit asset and must be backed up with both stores before an
upgrade or replacement cutover.

Connector registrations, capability declarations, Company OS identities and
runtime attestations stay behind Company OS ports. At exit, rebind Connector
runtime endpoints, preserve Company OS opaque IDs, import/export Paperclip-owned
generic work records, replay sanitized events from a recorded cursor, and never
transfer raw vendor sessions or credentials.
