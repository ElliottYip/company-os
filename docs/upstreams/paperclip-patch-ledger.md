# Paperclip patch ledger

Pinned baseline: `v2026.817.0` /
`213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`  
Last reviewed: 2026-08-18

## Budget and policy

- Target: **zero** changes to Paperclip core, schema and customer UI.
- Maximum temporary budget: one infrastructure-only patch with owner, upstream
  issue/PR, replay command, tests, expiry and deletion condition.
- Localization/brand/page patches are prohibited and do not enter the budget.
- Three consecutive 4–6 week version trains conflicting in the same area means
  the extension boundary failed; redesign the API/Plugin seam or downgrade
  Paperclip to `REFERENCE ONLY`.

## Active patches

None.

## Upstream-owned lockfile patches

Paperclip itself pins patches for `embedded-postgres` and `acpx`. They are not
Company OS patches, but every version-train audit must review their presence,
purpose and removal/upstreaming status because they affect upstream risk.

## Required row format

| ID | Area | Reason | Upstream issue/PR | Owner | Replay | Tests | Expiry | Delete when |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| _none_ | | | | | | | | |

