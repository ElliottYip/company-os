# ADR 0038: active and candidate release coordinates

Status: accepted, 2026-08-26.

## Context

The versioned staging store keeps the most recently installed bundle in
`prepared` and retains older bundles in `previous`. Once N is running, staging
N+1 necessarily moves N into `previous` before any migration or cutover occurs.
Treating `prepared` as the runtime release would falsely report N's healthy
containers as image drift and would prevent an authorized restart while N+1 is
only staged.

## Decision

The active release is the exact store record bound by private
`startup-state.json` release ID and source revision. The prepared record is a
candidate whenever it differs from that active record. With no startup record,
prepared remains the not-yet-started release.

The read-only runtime inspector verifies the active bundle and images, and
reports the candidate coordinates separately. Authorized restart resolves the
startup-bound active record even when it is retained in `previous`; it never
starts or migrates the candidate. Duplicate, absent, redirected or malformed
store records fail closed.

## Consequences

Operators may safely stage N+1 without changing N's health or maintenance
semantics. Upgrade automation now has two explicit immutable coordinates from
which to build compatibility, backup, migration and cutover evidence. The
existing store shape remains readable; no destructive metadata migration is
required.
