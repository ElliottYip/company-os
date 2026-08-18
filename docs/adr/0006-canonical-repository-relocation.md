# ADR 0006: Canonical repository relocation

Status: Accepted  
Date: 2026-08-18

## Decision

`/Users/elliottye/Documents/ChatGPT/os` is the canonical working repository for
the Pre-3D program. It imports the complete verified Git history ending at
`f904a66` from the previous task directory rather than copying an unversioned
snapshot.

The previous directory remains a read-only historical source until the user
chooses to archive it. New product work and commits occur only here.

## Consequences

- There is one active development location and one retained audit history.
- Old absolute paths in handoff documentation are historical and must not be
  used by build/runtime configuration.
- No deletion or cleanup of the previous directory is authorized by this ADR.

