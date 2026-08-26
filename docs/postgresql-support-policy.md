# PostgreSQL support policy

Status: Accepted, 2026-08-26.

Company OS supports PostgreSQL 16.15 and PostgreSQL 17.11 for the current
release line. Self-hosted ships PostgreSQL 16.15 as the conservative default;
managed-cloud may use either supported major. Operators must remain on the
latest admitted minor in their selected major. PostgreSQL 14, 15, 18 and 19 are
not implicitly supported merely because the SQL happens to run.

The policy follows PostgreSQL's upstream five-year major support model and its
recommendation to run the current minor release. A new minor is admitted after
migrations, restricted runtime-role operations, backup and restore complete.
A new major additionally requires a real logical dump/restore admission from
the previous supported major, data and migration-journal verification, and an
unchanged rollback source. Company OS does not perform an in-place major
upgrade or automatic destructive cutover.

`npm run test:upgrade:postgres-major` proves the 16→17 path using digest-pinned
official images and synthetic data. PostgreSQL 17's client creates the custom
format backup from PostgreSQL 16, restores into an empty PostgreSQL 17 target,
runs the current idempotent migrations, verifies retained Company OS data, and
proves the PostgreSQL 16 source remains a usable parallel rollback boundary.
The admission always removes its containers and network.

Production cutover still requires the release manifest, current encrypted
off-site backup evidence, restore rehearsal, a declared maintenance window and
explicit operator authorization. Passing the repository admission is not a
claim that a customer database was upgraded.
