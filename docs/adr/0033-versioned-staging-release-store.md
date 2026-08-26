# ADR 0033: Stage releases in a versioned, immutable local store

## Status

Accepted, 2026-08-26.

## Context

The staging doctor can prove that a target is safe to approach, and the release
bundle binds source, image digests and handoff files. Neither operation places
the verified payload on the target in a repeatable way. Ad-hoc copying would
make retries, provenance and rollback coordinates ambiguous.

Paperclip's pinned managed installer informed the lifecycle shape: it stages a
payload outside the active path, smoke-checks it, retains previous install
records and changes the selected version only after validation. The audited
sources are `cli/src/commands/install.ts`, `cli/src/install-store.ts`,
`cli/src/commands/doctor.ts` and their focused tests at commit
`213dabab4f8e1f3bb1803a2924c0fea1289fcd4c` (MIT). No Paperclip code, type,
configuration schema, directory name or runtime dependency was copied.

Company OS has a stricter database responsibility boundary than a desktop CLI:
placing Compose files on a host must not imply that migrations ran, customer
identity worked, services became ready or traffic moved.

## Decision

`release:staging-install` owns the prepare-only release-store lifecycle. On a
deployment host it runs from the exact attested Company OS Ops image, not from
an ambient checkout, npm installation or host Node runtime.

- Its default behavior is a read-only plan. Mutation requires `--apply`.
- The deployment root must be an absolute, operator-owned, non-symlink
  directory without group-write or any world permissions.
- The received bundle must have the exact allowlisted file set. Missing,
  duplicate, changed, undeclared or symlinked entries fail closed.
- A release ID binds semantic version and the first twelve characters of the
  full source revision. Payloads live under `releases/<release-id>`.
- Apply copies only verified regular files into a same-filesystem partial
  directory, verifies the copy again, and renames it into the final path.
- Reapplying the identical bundle is idempotent. If the retained directory has
  changed, installation stops instead of overwriting or deleting it.
- `release-store.json` is written atomically with state
  `PREPARED_NOT_STARTED`; the prior prepared record and payload remain intact.
- The tool never reads Secret values, invokes Docker, pulls images, runs a
  migration, starts services, changes ingress or deletes a prior release.
- Preparation runs with no network and no Docker socket. The received bundle is
  read-only, and the exact staging root is the only writable mount.

The filesystem implementation uses the Node 22 promise APIs documented for
[`lstat`](https://nodejs.org/docs/latest-v22.x/api/fs.html#fspromiseslstatpath-options),
[`copyFile`](https://nodejs.org/docs/latest-v22.x/api/fs.html#fspromisescopyfilesrc-dest-mode)
and [`rename`](https://nodejs.org/docs/latest-v22.x/api/fs.html#fspromisesrenameoldpath-newpath).
The temporary and final directories are deliberately siblings so rename never
depends on a cross-device move.

## Consequences

Operators get a stable, retry-safe local coordinate for Compose validation and
subsequent explicitly authorized start/cutover work. Rollback artifacts are
not silently pruned. The release record is evidence of preparation only; real
acceptance still requires external PostgreSQL, OIDC, Secret Broker, Agent Node,
Data Node, readiness, browser and recovery evidence.

This design borrows a mature installation lifecycle from Paperclip while
keeping Company OS independently licensed, built, deployed and maintained.
