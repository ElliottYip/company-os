# ADR 0024: Expand migrations and parallel-restore rollback

Status: Accepted
Date: 2026-08-25

## Context

A successful backup/restore drill proves disaster recovery, but it does not
prove that an existing Company OS installation can move from one release schema
to the next. Automatic down migrations are especially unsafe for a control
plane whose event, approval, evidence and responsibility records must not be
silently discarded.

The first declared upgrade boundary is from `0004_human_invites` to
`0005_durable_control_plane`. Migration 0005 adds the Connector outbox and
projection checkpoints without changing or deleting the existing tables.

## Decision

- Production migrations are forward-only and additive by default. Destructive
  or contract-narrowing changes require a new ADR and an explicit staged
  expand/backfill/contract release sequence.
- Before production migration, operators create and rehearse a PostgreSQL
  custom-format backup while traffic still uses the old schema.
- An older application may be restarted against an upgraded database only when
  the release explicitly declares and proves backward schema compatibility.
- Otherwise rollback restores the paired pre-upgrade backup into a new parallel
  database and cuts traffic over deliberately. Company OS never automatically
  overwrites or down-migrates the source database.
- CI runs `npm run test:upgrade:postgres16`. It creates an isolated PostgreSQL
  16 database at the frozen N-1 journal, writes production-labelled company and
  responsibility-event data, takes a pre-upgrade backup, migrates through the
  current API image, verifies retained data and the N-1 read/write contract,
  then restores the backup into a separate rollback database and proves its
  exact N-1 journal and data.

## Alternatives considered

### Generate automatic down migrations

Rejected because a syntactically reversible DDL change does not prove that
newer responsibility or evidence records can be represented by the older
application.

### Restore over the failed production database

Rejected because it destroys the best incident evidence and makes a second
recovery attempt harder. The restored target is always new and independently
validated before cutover.

### Treat a green current-schema migration as sufficient

Rejected because it does not test existing customer data, an N-1 application
contract or the rollback artifact.

## Consequences

- Migration compatibility becomes a release property backed by executable
  evidence, not an assumption based on additive-looking SQL.
- Rollback needs additional database capacity and an operator-controlled
  cutover, but retains both the failed source and verified recovery target.
- The current `0004` → `0005` boundary is proven compatible at the database
  contract level. A future release must add its own N-1 fixture and admission;
  this result cannot be generalized to an untested migration.
