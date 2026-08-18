# Source and migration manifest

Audit date: 2026-08-18  
Source repository (read-only):
`/Users/elliottye/Documents/Codex/2026-07-22/block-buzz-https-github-com-block/outputs/raft`  
Audited source HEAD: `b4701e28726e9a53837a4b5744ee2b867acd264a`  
Branch: `codex/raft-v2-safety-20260812`  
License: Apache License 2.0, Copyright 2026 Block, Inc.

The source worktree was not modified by this task. “Adapted” means concepts and
invariants were reviewed and reimplemented under Company OS-owned paths; no
runtime import or filesystem link points to Raft.

## Neutral core reception

| Source | Source status / commit | SHA-256 | Company OS target | Disposition |
|---|---|---|---|---|
| `company-os/src/core/controlPlane.ts` | committed / `08eda149` | `7cae7520b6356b74705c6f7328e6b821bb65964d62e76abbe7ba8642a7492802` | `core/control-plane.ts` | Adapted; normalized statuses, added fixture provenance, idempotency/timeout |
| `company-os/src/core/organization.ts` | committed / `516a0cf0` | `c241e6c4ae522ecb232e0aa3e4bc00fa543d30de4e463d45bc0a30122d2e693c` | `core/organization.ts` | Adapted with stable portable IDs and accountable-human invariant |
| `company-os/src/core/responsibility.ts` | committed / `b4701e28` | `d7afd35d4a0dd9ba119770ee1905e055440133da238912e9441bef05f37d1634` | `core/responsibility.ts` | Adapted; preserved critical-action human approval invariant |
| `company-os/src/core/work.ts` | staged, uncommitted | `93b12423a7f1e5f1b3d09860784bb1cedc33f1331b2524d560d148feadd7ad6e` | `core/work.ts` | Reviewed candidate and adapted; not represented as committed source work |
| `company-os/src/ports/identityPort.ts` | committed / `08eda149` | `0c7174f09944f1b8fcf44dfed21a4d3826397af1c32c6a7f15035f9ffbcc275a` | `ports/identity-port.ts` | Adapted and expanded; Raft details stay in adapter |
| `company-os/src/ports/companyEventStorePort.ts` | committed / `08eda149` | `3f4d43a3374d4646ac4f2e4d884d26c57717456913af6cb68c391875a3e7d0b8` | `ports/event-data-store-port.ts` | Adapted and renamed |
| `company-os/src/ports/agentRuntimePort.ts` | committed / `08eda149` | `d2bdf53cc1fd50356b333707952c712fa391f8ce4ff1e8b93bf218c949ed363f` | `ports/agent-execution-port.ts` | Adapted; added health, version, timeout, idempotency, runtime proof |
| `company-os/src/ports/approvalPort.ts` | committed / `08eda149` | `d07f77b1a9d1de0d6bb23892a2b09136612f43c025822aed0ab9b88887a94f44` | `ports/approval-publication-port.ts` | Adapted; approval binds exact responsibility tuple |
| `company-os/scripts/check-boundaries.mjs` | committed / `08eda149` | `791a61fd59f2eceea5b051ee75693829bef1b53f3120bbeb3277d419dba6ad45` | `scripts/check-boundaries.mjs` | Boundary idea reimplemented for root layout/import direction |
| `company-os/docs/independence-audit.md` | committed / `08eda149` | `f4c741c05f2ad08d8c9ed0fc718159f251367e5a8cce61c115c6b9eafdb28f52` | ADRs and architecture docs | Decisions incorporated, not copied verbatim |

Source tests were used as acceptance behavior and reauthored under `tests/`.
The source `company-os/src/index.ts` is a package barrel rather than domain
behavior; its public-surface intent is represented by Company OS-owned barrel
files. The staged source test `company-os/src/core/work.test.mjs` is represented
by `tests/neutral-core-reception.test.ts`.

## Explicitly excluded Raft-specific implementations

No code was received from `crates/buzz-acp`, `crates/buzz-core` event-kind or
Nostr-shaped schemas, `crates/buzz-relay`, or Web signer/NIP-07/relay/navigation/
theme code. Existing event kinds 30179–30189, 30624–30627, and 46021 plus
`snake_case`/`schema_version` compatibility remain future Raft adapter serializer
contracts, documented in ADR 0005.

## Visual source audit and copies

The three fish assets and empty office reference were untracked in the source
worktree at audit time. They were user-approved for this Company OS visual layer
and copied byte-for-byte.
The repository's Apache-2.0 license was copied to
`docs/licenses/RAFT-APACHE-2.0.txt`. The empty office PNG is a composition and
atmosphere reference, not a runtime background or a substitute for future 3D.

| Source | Source status | SHA-256 | Owned copy | Dependencies |
|---|---|---|---|---|
| `web/src/assets/raft-office/characters/raft-fish-bumble.png` | untracked | `1529b8a1f66cbef716e29437ffb7c110b4dee4e04c8ed7a410a72e5e63a3d3ba` | `web/assets/fish/raft-fish-bumble.png` | PNG only |
| `web/src/assets/raft-office/characters/raft-fish-fizz.png` | untracked | `ac1c32e85264091df04fe97867f554cfa58c2a54fc43c4d9b087c531fa649cdb` | `web/assets/fish/raft-fish-fizz.png` | PNG only |
| `web/src/assets/raft-office/characters/raft-fish-honey.png` | untracked | `c928cf6df88acd1b875e4f8ab18d521a588f87ea4d608e67a91ddd156b6ae3a9` | `web/assets/fish/raft-fish-honey.png` | PNG only |
| `web/src/assets/raft-office/scenes/coral-labs-office-empty-v1.png` | untracked | `71160eec6c5ac8370c17ca07bc14627ebd84c0f4993ed126250dc6eff85440bc` | `web/assets/scenes/coral-labs-office-empty-v1.png` | PNG only; reference-only |
| `LICENSE` | committed | `108cb15997e51b75a8d18b0c1e2c52bd3879d051ab02118973387df1e4aab584` | `docs/licenses/RAFT-APACHE-2.0.txt` | none |

## Visual references inspected, not copied as code

- `web/src/features/company-os/styles/raftCompanyOs.css` (untracked,
  `2ec085d9886ab368eff53ee90a978c77b1b287033717fa7b7003eab929dc1ff8`):
  semantic color/radius/button vocabulary informed an independently owned,
  visibly modified CSS design system.
- `web/src/shared/ui/button.tsx` (committed,
  `fdd55eac6f40abfd7c0784b0439aa7bcf87be1897f22db3834ab3288eadfc017`):
  dependency review found React, Radix Slot, CVA, `clsx`, and `tailwind-merge`;
  those dependencies were intentionally not copied into the vanilla Web shell.
- `web/src/shared/styles/globals.css` (modified,
  `caeaef40b03b17eec3db8f8d5f41c4109b39e08bc6996096f5d416c2a80bbb7c`):
  inspected for typography and token context only.
- `web/src/features/company-os/ui/FishAvatarPicker.tsx` and office catalog files:
  inspected for fish naming/alt-text behavior only; imports and code not copied.
- `web/src/features/company-os/office-assets/RaftFishAvatar.tsx` (untracked):
  inspected for asset selection, decorative alt behavior, and shadow treatment;
  React/Tailwind code was not copied.
- `web/src/features/company-os/ui/ClayAvatarPicker.tsx`: inspected and rejected as
  a visual target. Its nested CSS circles and torso blocks cannot represent
  embodied, riggable people coexisting in an office.

The separately supplied concept image path
`/Users/elliottye/Desktop/exec-7e0f5b06-5518-4639-94b0-126d28cb7610.png`
did not exist when audited on 2026-08-18, including a same-name search under
`Documents` and `.codex`. Its user-specified information architecture is recorded
in `docs/visual-baseline.md`, but its pixels are not claimed as inspected.
