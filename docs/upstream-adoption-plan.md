# Paperclip adoption and migration plan

## Recommended shape

Paperclip is a separately versioned generic-work service. Company OS is the
accountability/data/experience service and independent Web app. A narrow bridge
uses Paperclip's official Plugin SDK and HTTP/event APIs.

```text
Company OS Web
  -> Company OS API (responsibility, data policy, exact approvals, office)
       -> GenericWorkPort
            -> Paperclip bridge -> pinned Paperclip service
       -> ConnectorPort -> Raft/Codex/DeepSeek/enterprise connectors
```

The bridge maps opaque IDs and sanitized events. It never reads Paperclip tables,
stores provider sessions or credentials, or grants authority based on plugin UI.

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

## Allowed reuse

- Run Paperclip at the pinned upstream revision.
- Depend on published `@paperclipai/plugin-sdk` contracts.
- Call documented HTTP/event surfaces.
- Carry unmodified MIT notice for any distributed Paperclip software.

## Prohibited reuse

- Paperclip name, logo, screenshots or brand assets.
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

## Exit/replace

The `GenericWorkPort` contract and opaque mapping table are the seam. Export
Paperclip-owned records, import them into a replacement adapter, replay events,
compare Company OS projections and cut over. Responsibility and data contracts
remain in Company OS and are not migrated out of their canonical store.

