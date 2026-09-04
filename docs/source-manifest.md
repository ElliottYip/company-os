# Source and migration manifest

## Company OS “Follow the Light” real-photo references (2026-09-02)

The V3 visual-reference pass uses real location photographs to anchor geology,
weather, atmospheric depth, and photographic imperfection. These photographs
are licensed under the [Unsplash License](https://unsplash.com/license), which
allows free commercial and non-commercial use and modification. They are not
described as copyright-free or public-domain works. Photographer attribution is
retained here even though the license does not require it.

| Photographer / source page | License | SHA-256 | Project copy | Intended role |
|---|---|---|---|---|
| Filipe Freitas · [Lake Louise](https://unsplash.com/photos/snowy-mountains-overlook-a-frozen-lake-with-a-cabin-foocj3x5IWo) | Unsplash License | `4490b70125c642ab5ec553a0fbea4d3f00ad5e08c53435a52fc2cc9cda5d583a` | `outputs/company-os-follow-the-light-v3-photo-references/sources/01-lake-louise-filipe-freitas.jpg` | Shot 01 real mountain/lake/cabin environment reference |
| Himmel S · [Jungfrau mountain train](https://unsplash.com/photos/a-train-traveling-down-a-snow-covered-mountain-side-SJ6H6VtO4K8) | Unsplash License | `54dcfc44d6da0568194e41301db89967c4545f0496351f2824d375065523c1e6` | `outputs/company-os-follow-the-light-v3-photo-references/sources/03-jungfrau-train-himmel-s.jpg` | Shot 03 real train and alpine-scale reference |
| Georgi Kalaydzhiev · [Faroe Islands cliffs](https://unsplash.com/photos/small-lighthouse-on-a-rugged-cliff-overlooking-the-sea-bwJ1mH9c01Y) | Unsplash License | `32115c1aeab64858a7f7afabbb87f5ef800e003a57b1fdd7c33b070123a188cc` | `outputs/company-os-follow-the-light-v3-photo-references/sources/04-faroe-cliffs-georgi-kalaydzhiev.jpg` | Shots 04–05 real basalt coast reference |
| Art Markiv · [Grand Canyon](https://unsplash.com/photos/grand-canyon-arizona-0WyRXGnWMNY) | Unsplash License | `f2bddc67d799b4bff78271159c067a834db153ca1951b05bccfbdbaff582c9af` | `outputs/company-os-follow-the-light-v3-photo-references/sources/06-grand-canyon-art-markiv.jpg` | Shot 06 real canyon geology and storm-light reference |
| Josh Duke · [Newport Beach sunset](https://unsplash.com/photos/silhouette-of-people-standing-on-beach-during-sunset-O7fF03gWHOY) | Unsplash License | `3e0c6845a165b8c7812e3d156ec71ae7f0dd9e398ba8eb30bf5e7ecf7cc40b5a` | `outputs/company-os-follow-the-light-v3-photo-references/sources/07-newport-beach-josh-duke.jpg` | Rejected Shot 07 option retained for provenance |
| Anthony Adu · [Surfers at sunset](https://unsplash.com/photos/a-group-of-people-with-surfboards-on-a-beach-I9XeK1_BLnc) | Unsplash License | `8acbd6043489ee679b63792f20ef059bfa7410597da3f792d63478fea536ca05` | `outputs/company-os-follow-the-light-v3-photo-references/sources/07-surfers-anthony-adu.jpg` | Shot 07 real coastal activity reference |
| Mikhail Nilov · [Side-view laptop hand](https://www.pexels.com/photo/side-view-of-a-hand-on-a-laptop-keyboard-7989228/) | Pexels License | `bbf08078d50ec137b5461ec38709318dd0b470f80b7ad4bcb16beb075d68938c` | `outputs/company-os-follow-the-light-v3-photo-references/sources/device-macbook-side-mikhail-nilov.jpg` | Shot 02 laptop/hand perspective reference only |
| Thai Nguyen · [iPhone Air side view](https://unsplash.com/photos/hand-holding-a-black-smartphone-from-the-side-cdmKr4ew15I) | Unsplash License | `c0d1d391dcbdd3e437723af1aac7e58abd66be1facafba7b98525e237e35dba6` | `outputs/company-os-follow-the-light-v3-photo-references/sources/device-iphone-side-thai-nguyen.jpg` | Shot 05 phone/hand perspective reference only |

## Company OS film end-card brand assets (2026-09-02)

The Company OS concept film end card uses the official Raft mark from the
user-owned Generator repository. The mark is copied byte-for-byte into the
project-local output so the end card remains self-contained. A temporary
typographic `LEICO` placeholder reserves the second-logo position until the
user supplies the official Leico artwork; it is not a final or redrawn logo.

| Supplied source | SHA-256 | Owned copy | Role |
|---|---|---|---|
| `/Users/elliottye/Gnerator/public/raft-logo-mark.svg` | `ee6acf7dffe955227a1b9bd39825c4776cca951bc84cdaa852456f3a44c93725` | `outputs/company-os-end-card-v1/raft-logo-mark.svg` | Official Raft mark in the `Raft × Leico` end card |

## FDE user-supplied logo (2026-08-24)

The user supplied the following FDE logo directly for use in the bilingual
enterprise AI-upgrade brochure. The production copy is retained byte-for-byte;
its dominant brand orange is `#FF7A00` and is used as the brochure accent color.

| Supplied source | SHA-256 | Owned copy | Role |
|---|---|---|---|
| `codex-clipboard-3d5d9998-3dc0-4a29-8d43-d5c4857f6ceb.png` | `c4fe22e7acf301e41613797d5d4e404210a0c15fde620e9271fad7da79ed2ed2` | `docs/marketing/assets/fde-logo-orange-v1.png` | Cover brand mark and restrained footer signature |

## FDE brochure generated editorial imagery (2026-08-24)

The following four images were generated with the built-in image generation
tool for the FDE exhibition brochure. The user-supplied OpenAI report cover at
`/Users/elliottye/Desktop/download-1.png` was used only as a visual-direction
reference for soft-focus editorial photography. No OpenAI logo, text, page
layout, or source pixels are included in these original assets.

The final 12-page editorial brochure also uses OpenAI's publicly available
*A practical guide to building agents* PDF as a reference for general editorial
principles: US Letter portrait proportions, wide margins, large sans-serif
headlines, pale-pink section pages, thin rules, restrained page furniture, and
continuous prose/table layouts. No OpenAI logo, copy, diagrams, source images,
or PDF pages are embedded in the FDE brochure.

Reference: `https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf`

| Owned asset | SHA-256 | Role |
|---|---|---|
| `docs/marketing/assets/fde-tech-light-path-v1.png` | `e5984251f470a2644aa968c84b6e3de32861fb209fbc045872e952acde5f39d2` | Cover / first clear route through operational complexity |
| `docs/marketing/assets/fde-tech-light-path-orange-v2.png` | `e063a8ee3399f915258edb5fa8296b2667a0c14781b8b7b0a785b2dd22de5525` | Rejected orange light-path experiment; retained for audit and not embedded |
| `docs/marketing/assets/fde-tech-frosted-path-orange-v3.png` | `a3c027916407654f584a654e7ceda47b46c83b569fa6b3fd3202e261d775404d` | Rejected glass-as-subject experiment; retained for audit and not embedded |
| `docs/marketing/assets/fde-natural-orange-canyon-v4.png` | `d992c7d570f9b4522e969e83501981f6e6016b6918d08b316de3b57eab5291cf` | Natural orange cover background beneath a page-level frosted overlay |
| `docs/marketing/assets/fde-tech-review-gate-v1.png` | `26310ef0d10ab882a5db6c6f82bc9eea98897c1e504247a267fe692e91bd75c5` | Human review boundary in an agent workflow |
| `docs/marketing/assets/fde-tech-alignment-v1.png` | `6a46b18ce239bd1054a3655f08bb3bf4984fa07c549d82eec197f00e8ce9b0b1` | Business, workflow, data, and delivery alignment |
| `docs/marketing/assets/fde-tech-orchestration-v1.png` | `937715f1c54b1e5ea1cfadce7ad67714d32049496f1f398a37763e67690617bf` | Human-led coordination of agents |

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

The three fish assets were untracked in the source worktree at audit time. They
were user-approved for the Company OS workforce graph and copied byte-for-byte.
The repository's Apache-2.0 license was copied to
`docs/licenses/RAFT-APACHE-2.0.txt`.

| Source | Source status | SHA-256 | Owned copy | Dependencies |
|---|---|---|---|---|
| `web/src/assets/raft-office/characters/raft-fish-bumble.png` | untracked | `1529b8a1f66cbef716e29437ffb7c110b4dee4e04c8ed7a410a72e5e63a3d3ba` | `web/assets/fish/raft-fish-bumble.png` | PNG only |
| `web/src/assets/raft-office/characters/raft-fish-fizz.png` | untracked | `ac1c32e85264091df04fe97867f554cfa58c2a54fc43c4d9b087c531fa649cdb` | `web/assets/fish/raft-fish-fizz.png` | PNG only |
| `web/src/assets/raft-office/characters/raft-fish-honey.png` | untracked | `c928cf6df88acd1b875e4f8ab18d521a588f87ea4d608e67a91ddd156b6ae3a9` | `web/assets/fish/raft-fish-honey.png` | PNG only |
| `LICENSE` | committed | `108cb15997e51b75a8d18b0c1e2c52bd3879d051ab02118973387df1e4aab584` | `docs/licenses/RAFT-APACHE-2.0.txt` | none |

## Visual code received and references inspected

- Paperclip Storybook story
  `product-navigation-layout--board-chrome-matrix` at
  `http://127.0.0.1:6006/`: inspected for functional arrangement only. Company
  context, quick actions, grouped navigation, breadcrumbs, command discovery,
  and mobile bottom-navigation patterns were reimplemented in `web/mount.ts`
  and `web/styles.css`. No Paperclip code, assets, product models, or runtime
  dependency were copied.
- Paperclip `0.3.1` local source checkout under
  `work/upstream-audit/paperclip/ui/storybook-static`: page-level stories for
  Inbox, Decisions, Agent Detail, Work Timeline, Routines, Artifacts, Secrets,
  Tool Access, navigation, and mobile variants were captured as reference-only
  screenshots. The valid capture list and viewport contract are recorded in
  `docs/paperclip-page-atlas.md`. No Paperclip source, bundled asset, or runtime
  dependency was copied into Company OS.

- `web/src/features/company-os/styles/raftCompanyOs.css` (untracked,
  `2ec085d9886ab368eff53ee90a978c77b1b287033717fa7b7003eab929dc1ff8`):
  the Apache-2.0 token, panel, button, status, focus, and interaction primitives
  were ported into `web/family-ui.css` with neutral family class names. The
  Company OS shell consumes this repository-owned copy and has no runtime import
  or filesystem link to Raft.
- `web/src/shared/ui/button.tsx` (committed,
  `fdd55eac6f40abfd7c0784b0439aa7bcf87be1897f22db3834ab3288eadfc017`):
  dependency review found React, Radix Slot, CVA, `clsx`, and `tailwind-merge`;
  those dependencies were intentionally not copied into the vanilla Web shell.
- `web/src/shared/styles/globals.css` (modified,
  `caeaef40b03b17eec3db8f8d5f41c4109b39e08bc6996096f5d416c2a80bbb7c`):
  inspected for typography and token context only.
- `web/src/features/company-os/ui/CompanyOsShell.tsx`,
  `CompanyOsEmptyPage.tsx`, `AgentBossPage.tsx`, `CompanyWorkPage.tsx`,
  `ApprovalInboxPage.tsx`, `ResponsibilityLedgerPage.tsx`,
  `AgentConnectorStudioPage.tsx`, `ModelDataStudioPage.tsx`,
  `BusinessProjectsPage.tsx`, and their directly composed UI components:
  inspected as a complete page-grammar set. Their shell, header, metric, list,
  card, status, form and contextual-detail patterns were reimplemented in
  `web/components/raft-ui.ts`, `web/family-ui.css`, `web/mount.ts`, and
  `web/styles.css`. React, Tailwind, routing and domain/data dependencies were
  not copied. See `docs/raft-frontend-inventory.md`.
- `docs/assets/screenshots/channel-thread.png`, `channel-agents.png`,
  `create-channel.png`, and `media-comments.png` (committed): inspected as the
  authoritative Buzz product-shell reference. Their continuous white work
  surface, pale grey-green rail, dense navigation, compact toolbar, thin
  controls, and activity-led content hierarchy were reimplemented in
  `web/styles.css` and `web/family-ui.css`. The screenshots were not copied.
- `web/src/features/company-os/ui/FishAvatarPicker.tsx`: inspected for fish
  naming/alt-text behavior only; imports and code not copied.
- `web/src/features/company-os/office-assets/RaftFishAvatar.tsx` (untracked):
  inspected for asset selection, decorative alt behavior, and shadow treatment;
  React/Tailwind code was not copied.
- `web/src/features/company-os/ui/ClayAvatarPicker.tsx`: inspected and rejected as
  a visual target for the workforce graph.


## Workforce graph open-source dependencies

No Relevance AI source code, brand asset, customer logo, screenshot, video, or
runtime service was copied. The public site and documentation were inspected
only to establish interaction and visual baselines.

| Package | Fixed version | Source | License | Package integrity | Use |
|---|---:|---|---|---|---|
| `@xyflow/react` | `12.8.5` | `https://github.com/xyflow/xyflow`, package directory `packages/react` | MIT | `sha512-NRwcE8QE7dh6BbaIT7GmNccP7/RMDZJOKtzK4HQw599TAfzC8e5E/zw/7MwtpnSbbkqBYc+jZyOisd57sp/hPQ==` | Web-only graph viewport, custom nodes and edges |
| `@dagrejs/dagre` | `1.1.5` | `https://github.com/dagrejs/dagre` | MIT | Locked in `package-lock.json`; npm publish metadata maps to git commit `1339f5516508dba0cbcc4ef1c0587e7384bec23d` | Initial Web-only directed graph layout |
| `react` / `react-dom` | `19.1.1` | `https://github.com/facebook/react` | MIT | Locked in `package-lock.json`; npm publish metadata maps to git commit `4017a4b43b9d8d4a2b75fe81dde69f6e62453e68` | Isolated Web island runtime |

The dependency types and internal data structures are forbidden from Company OS
`core`, `ports`, and `application`. The canonical graph projection remains
Company OS-owned and renderer-neutral.

## Generator Web design-system reuse (2026-08-24)

The user explicitly authorized reuse from their separately owned Generator
repository. The source was read-only during this slice; no credentials,
generated customer content, backend code, or runtime dependency was copied.
The discovery request originated from Codex task
`01a02c9a-9da2-7ba2-b478-b85e248fb50b`; the authoritative reusable source was
resolved to the repository and immutable revision below rather than copying a
task transcript or generated preview.

| Source | Fixed revision | Rights / license finding | Company OS use |
|---|---|---|---|
| `/Users/elliottye/Gnerator` | `a66c8996cb6150da3a2da5a5026efe771942583d` | Private user-owned repository; no root distribution license found at the pinned revision. Reuse is based on the user's explicit authorization for this project, not a public OSS license claim. | Visual tokens and low-coupling form/sidebar interaction patterns only |
| `DESIGN.md` | same revision | Same as above | Warm white canvas, compact control rhythm, restrained borders and radii |
| `src/components/ui/form-controls.tsx` | same revision | Same as above | Reimplemented the 42px, 8px-radius, `#d7dde7` form-control treatment in `web/styles.css`; no Next.js/Tailwind imports |
| `src/components/ui/button.tsx` | same revision | Same as above | Mapped primary/secondary action hierarchy onto Company OS-owned button primitives |
| `src/components/root/app-sidebar-shell.tsx` | same revision | Same as above | Used its compact navigation density as a visual baseline; Company OS keeps its own routes, icons, copy and DOM implementation |
| `src/app/globals.css` | same revision | Same as above | Reused the user-owned SF Pro/PingFang font-stack direction and neutral surface values where compatible |

Paperclip's previously audited onboarding, company setup, empty-state and command
flow patterns remain **reference-only**. This implementation does not import or
copy Paperclip page code, brand assets, copy, database types, API clients, or
runtime services.

## Product UI icon dependency (2026-08-24)

Company OS uses Lucide as a maintained Web dependency instead of embedding
hand-drawn SVG paths or copying icons from Paperclip or Generator. The package
is consumed only by `web`; no Lucide type or implementation enters `core`,
`ports`, or `application`.

| Package | Fixed version | Source | License | Package integrity | Use |
|---|---:|---|---|---|---|
| `lucide` | `1.33.0` | `https://github.com/lucide-icons/lucide`, package directory `packages/lucide` | ISC | `sha512-qfSZR1mmM65zfGeqonve67gtHBmyJtvlpdMuXiQLN04RaQmEvD0o85S9Gi+A6JQaQXpjKz5FIUBdAUEhb1Lj1Q==` | Navigation, task controls, dialogs, command search and mobile actions |

## Product interaction reconstruction (2026-08-24)

The pinned Paperclip evidence already recorded above and in
`docs/paperclip-ui-extraction/` was reused without another repository audit.
Company OS extracted only general interaction problems: company-scoped shell,
progressive setup, dense task list, breadcrumb detail, tabbed records, global
create/search, and explicit administrative empty states.

No Paperclip source file, component, Tailwind class, icon, prose, trademark,
shared type, API client, database schema, asset, or runtime dependency was
copied. The resulting implementation is independently authored in
`web/mount.ts`, `web/styles.css`, `web/i18n/en.ts`, and
`tests/e2e/company-os.spec.ts`. The no-upstream boundary test rejects the
competitor name in the Web implementation itself.

## Codex Agent Node runtime dependency (2026-08-26)

| Package | Fixed version | Source | License | Use and boundary |
|---|---:|---|---|---|
| `@openai/codex` | `0.144.1` | `https://github.com/openai/codex`, package directory `codex-cli` | Apache-2.0 | Installed only in the separately built Agent Node image; invoked through stable `codex exec`; no package import or private type crosses into Company OS |

The exact version is pinned in `deploy/Dockerfile.codex-agent-node` and bound in
the attested release manifest. Authentication is mounted at runtime and is not
part of the image, repository, control-plane database, or evidence projection.
The official `codex exec` contract was verified against
`https://learn.chatgpt.com/docs/developer-commands?surface=cli`; the experimental
App Server contract at `https://learn.chatgpt.com/docs/app-server` is not used
by this first driver.

The existing Paperclip audit at tag `v2026.817.0`, commit
`213dabab4f8e1f3bb1803a2924c0fea1289fcd4c` (MIT), was reused as an engineering
reference for process groups, timeout escalation, bounded run summaries,
explicit stop reasons, session/recovery separation and usage normalization.
The representative upstream paths and local differences are recorded in ADR
0029. No Paperclip source line, package, schema, runtime type or service was
copied into the Codex Agent Node.

## Docker-only operations runtime dependency (2026-08-26)

The staging target is not required to contain the Company OS source tree,
Node.js, or npm. `deploy/Dockerfile.ops` therefore copies only the Docker CLI
and Compose plugin from the following fixed official image:

| Incorporated binary | Observed version | Exact build source | Upstream source | License | Local destination and purpose |
|---|---:|---|---|---|---|
| Docker CLI | 29.1.3, build `f52814d` | `docker:29.1.3-cli@sha256:4fa0ee1f3a7e4354c4ea34558b6d4ee32859baf4973d4c8ccc8e7fe3dd730c04` | `https://github.com/docker/cli/tree/v29.1.3` | Apache-2.0; upstream NOTICE retained | `/usr/local/bin/docker` in the operations image; invokes the target's separately operated Docker daemon |
| Docker Compose plugin | 5.0.0 | same exact official image | `https://github.com/docker/compose/tree/v5.0.0` | Apache-2.0; upstream NOTICE retained | `/usr/local/libexec/docker/cli-plugins/docker-compose` in the operations image; validates and starts the Company OS Compose project |

No Docker source file is copied into this repository. The Docker daemon is not
distributed by Company OS. The prepare-only release installation does not
receive a daemon socket or network. Later doctor/start stages may receive the
socket only as a short-lived, exact-digest operator container with explicit
authority; no long-running Company OS service receives it. See ADR 0032 and
ADR 0033. Paperclip's pinned service-manager/run/update implementation was used
only as the lifecycle-separation reference; no Paperclip code or runtime type
was copied.

## Paperclip service lifecycle reference (2026-08-26)

At pinned MIT revision `213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`,
Company OS reviewed `cli/src/services/service-manager.ts`,
`cli/src/commands/run.ts`, `cli/src/commands/update.ts`, and their representative
service-manager, run and doctor tests. The independently authored staging
operator adopts the generic separation of install, doctor, run and update
lifecycles; validation before start; a single-writer guard; retained previous
payloads; and explicit health/failure state.

Company OS adds a release-manifest/image match, an external authorization
reference, no-Secret state records, database-migration ambiguity handling and
`STARTED_NOT_ACCEPTED` semantics. It does not copy Paperclip source, service
names, process records, configuration, data schema, package, UI or update
protocol. Paperclip remains an engineering reference, not a Company OS runtime
or upgrade dependency.

The subsequent Company OS runtime inspector also adapts the upstream distinction
between supervisor status and HTTP health, while closing two audited gaps: it
binds both observations to the exact retained release images and never treats a
nullable preservation report or healthy process as customer acceptance. Docker
inspection requests only service/image/status/health fields and never retrieves
container environment variables.

The deployment drain assessment adapts Paperclip's useful drain-before-restart
idea, but not its service types or nullable preservation report. Company OS
derives the decision from its own Work Attempt, approval, Connector outbox and
Secret-lease records, blocks every non-terminal state by default, and emits a
secret-free exact-source digest for later adoption comparison.

The authorized staging restart state machine also adapts the sequencing idea
from Paperclip's supervised service lifecycle, but independently requires a
Company OS drain proof, exact immutable release status, shared lifecycle lock,
explicit external change reference and post-restart adoption proof. No upstream
service manager, state record, command implementation or schema is copied.

The persistent instance dispatch freeze extends that reference beyond process
supervision. Paperclip's pinned lifecycle work exposed the generic
drain-before-restart problem; Company OS independently models the solution as a
revisioned, instance-admin-authorized domain state with an append-only audit
event. Its maintenance schema, port, HTTP command, dispatch guard and exact
source digest are Company OS-owned and deliberately do not reproduce
Paperclip's service state, database schema, internal types or routes. See ADR
0039.

The evidence-bound staging dependency manifest similarly adopts only the
generic validate-before-mutation discipline from the pinned Paperclip service
lifecycle audit. Its exact owner/evidence fields, enterprise boundary set,
production-resource denylist and canonical digest are independently authored
for Company OS. No Paperclip configuration record, schema, service coordinate,
runtime type or implementation is copied. See ADR 0040.

## Vault Secret Broker contract sources (2026-08-26)

The maintained Vault adapter is independently authored against HashiCorp's
published AppRole and KV v2 HTTP contracts:

- `https://developer.hashicorp.com/vault/api-docs/auth/approle`
- `https://developer.hashicorp.com/vault/api-docs/secret/kv/kv-v2`
- `https://developer.hashicorp.com/vault/docs/concepts/response-wrapping`
- `https://hub.docker.com/r/hashicorp/vault/tags`

The real compatibility admission pins the official multi-platform Vault 1.21.4
image manifest as
`hashicorp/vault@sha256:4e33b126a59c0c333b76fb4e894722462659a6bec7c48c9ee8cea56fccfd2569`.
It uses only ephemeral synthetic data and removes its container and state after
the admission. The image is test infrastructure, not a Company OS runtime
dependency or a prescribed customer Vault version.

No Vault server or client-library code is copied. The adapter sends the
documented AppRole and KV v2 exact-read/CAS-write HTTP shapes directly and has
no Vault runtime package dependency. The Broker-owned management form and
private reference registry are independently authored Company OS code.
Paperclip's pinned Secret schema/service files remain the already-recorded
generic lifecycle reference; its provider code, schema and UI were not copied.

## PostgreSQL supported-version and major-upgrade sources (2026-08-26)

Company OS independently implements its database schema, migrations and
admissions against PostgreSQL's published support policy and official images:

- `https://www.postgresql.org/support/versioning/`
- `https://hub.docker.com/_/postgres/tags`

The default 16.15 image is pinned as
`postgres:16.15-bookworm@sha256:bb3e1a57e5407e0a5280b4211980a5e537f4abd234a87014ac979849a78dd825`;
the second supported-major admission pins 17.11 as
`postgres:17.11-bookworm@sha256:051f7b7b3abdd564d5d1bd1e8c4b9c1b6e77087d1dd22020ede611c096a272e0`.
No PostgreSQL source code is copied and neither image is a Node runtime
dependency. Paperclip commit
`213dabab4f8e1f3bb1803a2924c0fea1289fcd4c` remains the engineering reference
for checksum, advisory-lock, migration-safety and parallel-recovery discipline;
its schema, migrations, embedded database defaults and backup format are not
copied.

## Caddy reference TLS gateway (2026-08-27)

The staging-only reference dependency topology uses the official Caddy
`2.11.4-alpine` multi-platform image solely as an HTTPS reverse-proxy boundary
between the product network and the isolated OIDC, Vault Broker, and Agent Node
network:

- image: `caddy:2.11.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648`
- official image recipe revision:
  `caddyserver/caddy-docker@fba2853501d36e8a72f946ac8cb7ff64d07e48f2`
- official-image catalog:
  https://github.com/docker-library/official-images/blob/master/library/caddy
- Caddy source and Apache-2.0 license:
  https://github.com/caddyserver/caddy and
  https://github.com/caddyserver/caddy/blob/master/LICENSE

The digest was verified from the OCI index before inclusion. Company OS copies
no Caddy source, page, trademark, or configuration; its independently authored
minimal Caddyfile disables the admin API and serves only target-generated TLS
material mounted read-only. Caddy is not a Core/Application dependency and can
be replaced with another contract-compatible TLS gateway.

## Dex reference OIDC runtime contract (2026-08-27)

The staging reference dependency topology identifies its OIDC runtime as
`DEX` instead of accepting a generic image behind Dex-specific commands. The
independently authored site contract and future target initializer were checked
against these upstream sources:

- Dex configuration parser and static-client environment support:
  https://github.com/dexidp/dex/blob/master/cmd/dex/config.go and
  https://github.com/dexidp/dex/blob/master/cmd/dex/serve.go
- official image construction and unprivileged runtime user:
  https://github.com/dexidp/dex/blob/master/Dockerfile
- distributed configuration shape:
  https://github.com/dexidp/dex/blob/master/config.yaml.dist
- Apache-2.0 license:
  https://github.com/dexidp/dex/blob/master/LICENSE

No Dex source, trademark, page, or configuration file is copied. A target site
must provide an immutable image digest and the authorized initializer must
render its private client configuration without placing Secret values in
Compose, retained evidence, or command arguments. Dex remains a replaceable
deployment adapter and is not imported by Core/Application.

## Paperclip authorization behavior adoption (2026-08-24)

At pinned MIT revision `213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`,
Company OS adopted the permission-key vocabulary and behavioral authorization
precedence verified in `packages/shared/src/constants.ts`,
`server/src/services/company-member-roles.ts`, and
`server/src/services/authorization.ts`. The local implementation is
independently authored in `core/company-access.ts` and
`adapters/identity/session-company-identity-adapter.ts`; it uses Company
OS-owned tables and types and has no Paperclip import or runtime dependency.
The corresponding MIT license obligation is already recorded for this pinned
audit source.

## Paperclip invitation and Agent-admission behavior adoption (2026-08-24)

At pinned MIT revision `213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`,
Company OS reviewed `server/src/routes/access.ts`,
`packages/db/src/schema/invites.ts`,
`packages/db/src/schema/join_requests.ts`,
`server/src/services/invite-grants.ts`,
`server/src/services/agent-invokability.ts`,
`packages/shared/src/agent-eligibility.ts`,
`packages/shared/src/agent-eligibility.test.ts`,
`packages/db/src/schema/agents.ts`, `server/src/services/agents.ts`, and
`server/src/__tests__/agents-pending-approval-config.test.ts`.

The independently authored Company OS implementation preserves the generic
behavioral invariants: hashed single-use invite tokens, atomic invite
acceptance and membership grants, non-invokable pending Agents, frozen pending
configuration, approval-snapshot admission, and non-invokability for paused,
terminated, unknown, or invalid-reporting-chain states. Company OS stores these
contracts in its own event and access schema and imports no Paperclip runtime
code or types. Accountable-human responsibility, exact action-bound approval,
equal Connector readiness, and enterprise data authorization are documented
Company OS extensions rather than attributed to Paperclip.

The Company OS-owned implementation is in `core/agent-lifecycle.ts`,
`ports/agent-lifecycle-port.ts`, `application/manage-agent-lifecycle.ts`, and
`adapters/storage/event-backed-agent-lifecycle-store.ts`. It preserves the
assignment/invocation distinction, explicit approval/pause/resume/error-clear/
termination actions, irreversible termination, and reporting-chain health.
Connector admission is the Company OS-neutral equivalent of verifying a known,
enabled Agent adapter before approval.

The same pinned-source review also covered
`ui/src/components/AgentConfigForm.tsx` and the update/approve routes in
`server/src/routes/agents.ts`. Company OS independently implements the
resulting interaction contract in `web/application-client.ts`, `web/mount.ts`,
and `web/pages/operational-pages.ts`: users bind a registered Connector,
activate the separate responsibility contract, and approve the Agent through
distinct commands. `application/revise-company-organization.ts` rejects
ordinary changes to pending Agent configuration with the stable
`PENDING_APPROVAL_AGENT_CONFIG_FROZEN` code. No Paperclip UI component,
database type, route implementation, or runtime package is imported or copied.

The formal add-Agent path specifically follows the board-gated hire behavior in
`server/src/routes/agents.ts` (`POST /companies/:companyId/agent-hires`) and the
`hire_agent` approval records exercised by
`server/src/__tests__/built-in-agents.test.ts`: the Agent is persisted in
`pending_approval`, its reviewed configuration is frozen, and execution remains
denied until approval. Company OS reauthors this through one durable
`organization.revised` event: a new Agent receives a `pending_approval`
lifecycle projection, reporting line, and non-executable `DRAFT` responsibility
contract. Company OS additionally requires the named accountable human and
separate responsibility activation. No Paperclip approval payload, Agent row,
adapter configuration, default grant, or UI code was copied.

## Paperclip grant and Secret lifecycle behavior adoption (2026-08-24)

At pinned MIT revision `213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`,
Company OS reviewed `packages/db/src/schema/tool_access.ts`,
`server/src/routes/tool-access.ts`, `server/src/services/tool-access.ts`,
`server/src/services/tool-access-policy.ts`,
`packages/db/src/schema/company_secrets.ts`,
`packages/db/src/schema/company_secret_versions.ts`,
`server/src/routes/secrets.ts`, and `server/src/services/secrets.ts`.

The adopted generic behavior is independently authored: grants are
company-scoped and subject-bound, start active, default-deny when absent,
support non-destructive pause/resume where applicable, and treat revocation as
terminal. Secret metadata, Secret versions, provider configuration, and secret
material remain separate; inactive or revoked material cannot be resolved.

Company OS applies this behavior in
`application/manage-data-authorization-contract.ts` and its narrow formal API.
Agent binding, purpose, classification, validity, export destination, content
digest, accountable-human evidence, and the data-egress firewall are Company OS
extensions. No Paperclip source, database schema, route implementation, UI,
trademark, or Secret value was copied; Paperclip remains an audit reference
with no runtime dependency.

The Tool Access portion was subsequently implemented from the same pinned
evidence plus `packages/shared/src/constants.ts`,
`packages/shared/src/types/tool-access.ts`, and
`packages/shared/src/validators/tool-access.ts`. The independently authored
Company OS files are `core/tool-access.ts`,
`ports/tool-access-catalog-port.ts`,
`application/tool-access-registry.ts`, `application/manage-tool-access.ts`,
`adapters/storage/event-backed-tool-access-catalog-store.ts`, and the narrow
HTTP/Web adapters. They preserve the upstream profile status, selector,
effect, binding target, policy type, priority, and default-deny vocabulary.
Unsupported trust and rate-limit execution semantics deliberately fail closed.
No upstream source line, schema, migration, UI component, copy, trademark, or
asset was copied; only behavior was reauthored under Company OS types and
storage.

The same review informed the independently authored single-package registry in
`adapters/secrets/load-formal-secret-broker.ts` and the neutral runtime contract
in `ports/secret-broker-runtime-port.ts`. It adopts the upstream separation of
provider discovery, descriptor/capability metadata, health checks, versioned
material, and resolution. Company OS deliberately exposes only capability and
health metadata to its administration projection; broker-owned material and
provider configuration remain outside the event store and Web. No upstream
provider implementation, registry array, schema, or internal type was copied.

The installed model-provider registry in
`adapters/models/load-formal-model-providers.ts` follows the same pinned
adapter-registry evidence: startup waits for package factories, validates a
versioned capability declaration, rejects duplicate adapter identities, and
fails loud on invalid installed packages. `application/manage-model-route.ts`
follows the upstream same-company Secret-reference preflight before storing a
connection, while adding Company OS model classification and residency policy.
Routes begin disabled and are revalidated on enable. No upstream adapter,
model catalog, credential field, private session, UI component, or schema was
copied.

Paperclip's `server/src/adapters/registry.ts` and
`server/src/adapters/http/test.ts` were used as behavioral evidence that saved
adapter configuration and live environment readiness are separate states, and
that a warning can remain operable while a failed environment must not run.
Company OS independently applies that rule through `AgentExecutionPort`:
approval requires a matching live port; `UNAVAILABLE` blocks admission;
`DEGRADED` remains visible; and the administration projection reports
`NOT_BOUND` when only catalog metadata exists. Paperclip's HTTP adapter payload,
header configuration, registry types, and implementation were not copied.

The service composition additionally adopts the pinned registry's generic
startup behavior: server-side adapter modules load before admission, readiness
is awaited, and declared adapter identity is validated separately from live
health. Company OS independently implements the smaller neutral package loader
in `adapters/connectors/load-formal-connectors.ts`. It accepts installed npm
package names only, requires a `createAgentExecutionPort` factory, validates the
Company OS port and capabilities, and rejects duplicate Connector IDs. It does
not copy Paperclip's built-in registry, override rules, plugin store, adapter
types, configuration schema, install commands, UI, or provider packages.

Paperclip's separate create/update adapter routes also informed the narrow
Company OS registration commands. Company OS does not ask its sanitized Web
projection to round-trip an entire stored catalog: `POST .../connectors`
derives immutable capabilities from the installed runtime, while
`PATCH .../connectors/{id}` changes only enabled state. The independent
implementation is `application/manage-connector-runtime-registration.ts` and
the Company OS HTTP/Web adapters. This preserves hidden Secret references and
does not copy Paperclip route bodies, config schemas, or database records.

## Paperclip generic work/run durability reference (2026-08-24)

At pinned MIT revision `213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`,
Company OS reviewed `packages/db/src/schema/heartbeat_runs.ts`,
`server/src/services/agent-start-lock.ts`,
`server/src/services/run-liveness.ts`,
`server/src/__tests__/heartbeat-start-lock.test.ts`,
`server/src/__tests__/heartbeat-process-recovery.test.ts`, and
`server/src/__tests__/approval-routes-idempotency.test.ts`.

The adopted generic invariants are a durable run record, serialized Agent
start, bounded lease and timeout behavior, idempotent approval side effects,
explicit recovery after runtime loss, and evidence-backed terminal results.
The independently authored Company OS implementation is in
`core/work-attempt.ts`, `application/work-attempt-service.ts`,
`ports/durable-control-plane-store-port.ts`,
`adapters/storage/local-durable-control-plane-store.ts`, and
`adapters/persistence/postgres/postgres-event-store.ts`.

Company OS deliberately adds an immutable accountable-human, responsibility,
permission, data-authorization, and Connector-capability authority snapshot to
each attempt, then publishes only secret-free Connector commands. It does not
store or copy Paperclip process IDs, private sessions, adapter configuration,
database schema, source code, UI, trademark, or assets.

The same pinned-source behavior review also covered Paperclip
`server/src/routes/companies.ts`, `server/src/services/company-portability.ts`,
and `server/src/services/export-fidelity.ts`. Company OS adopted the generic
preview/verify-before-import, tenant-bound route, bounded input, integrity
digest, and no-silent-overwrite principles. It did not copy Paperclip's bundle,
ZIP layout, schemas, service code, brand files, or database types. Company OS
uses its existing `DurableControlPlaneStorePort` backup as the sole canonical
format and exposes it through independently authored formal API and Web
adapters.

The recovery worker additionally reviewed Paperclip
`server/src/config.ts`, `server/src/index.ts`,
`server/src/services/heartbeat.ts`,
`server/src/services/run-liveness.ts`,
`server/src/__tests__/heartbeat-start-lock.test.ts`, and
`server/src/__tests__/heartbeat-process-recovery.test.ts` at the same pinned
commit. Company OS reauthored the bounded scheduler and restart-redrive shape
in `application/redrive-connector-commands.ts` and the thin timer adapter in
`adapters/connectors/connector-command-supervisor.ts`. It uses a 30-second
default interval with a 10-second floor, prevents overlapping scans, isolates
failures by company, and retains pending commands until an idempotent Connector
acknowledgement. No Paperclip heartbeat process/session, registry, schema, or
recovery code was copied.

The Connector observation path additionally reviewed
`packages/db/src/schema/heartbeat_run_events.ts`,
`packages/db/src/schema/issue_work_products.ts`,
`packages/shared/src/types/heartbeat.ts`, and the bounded append/list/finalize
paths in `server/src/services/heartbeat.ts`. Company OS independently preserves
the generic invariants: monotonically sequenced run events, bounded summaries,
digest-backed artifacts, idempotent replay, a separate terminal result
reference, and terminalization only after a fenced running attempt. The
implementation is `application/collect-connector-observations.ts` plus the
Company OS-owned `WorkObservation` contract. It never stores a provider session,
process ID, raw reasoning, credential, or Paperclip result schema.
An unrecorded observation must be exactly the next sequence; a gap fails with
`CONNECTOR_OBSERVATION_SEQUENCE_GAP` so missing progress or evidence cannot be
silently hidden by a later terminal report.

## Paperclip costs and budgets behavior adoption (2026-08-24)

At pinned MIT revision `213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`,
Company OS reviewed `packages/db/src/schema/cost_events.ts`,
`packages/db/src/schema/budget_policies.ts`,
`packages/db/src/schema/budget_incidents.ts`,
`packages/shared/src/constants.ts`, `packages/shared/src/types/cost.ts`,
`packages/shared/src/types/budget.ts`,
`packages/shared/src/validators/cost.ts`,
`packages/shared/src/validators/budget.ts`, `server/src/services/costs.ts`,
`server/src/services/budgets.ts`, `server/src/routes/costs.ts`, and their focused
service tests.

The independently authored Company OS implementation is
`core/usage-budget.ts`, `ports/usage-budget-store-port.ts`,
`application/manage-usage-budget.ts`,
`adapters/storage/event-backed-usage-budget-store.ts`, and its HTTP/Web
projection. It preserves billing types, reported/unpriced status, integer
cents, company/Agent/project policy scopes, `billed_cents`, UTC month/lifetime
windows, warning percentage, hard stop, notification, and active state. It adds
a digest-bound opaque usage reference and refuses to estimate unpriced costs.
No Paperclip schema, migration, service, route code, UI, copy, or brand asset
was copied.

## Paperclip goals/projects behavior adoption (2026-08-24)

At pinned MIT revision `213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`,
Company OS reviewed `packages/db/src/schema/goals.ts`,
`packages/db/src/schema/projects.ts`, `packages/shared/src/constants.ts`,
`packages/shared/src/types/goal.ts`, `packages/shared/src/types/project.ts`,
`server/src/services/goals.ts`, `server/src/services/projects.ts`,
`server/src/routes/goals.ts`, and `server/src/routes/projects.ts`.

Company OS adopts the exact generic goal levels (`company`, `team`, `agent`,
`task`), goal statuses (`planned`, `active`, `achieved`, `cancelled`), and
project statuses (`backlog`, `planned`, `in_progress`, `completed`,
`cancelled`), plus tenant-scoped list/create/update behavior and revision
conflict protection. The independently authored implementation lives in
`core/planning.ts`, `ports/planning-store-port.ts`,
`application/planning-registry.ts`, and
`adapters/storage/event-backed-planning-store.ts`.

Company OS explicitly extends each Goal and Project with an accountable human;
an Agent owner/lead is valid only when its responsibility owner matches. It
also retains archived/cancelled records instead of allowing deletion to erase
the responsibility trail. Paperclip schemas, route/service code, workspace
runtime configuration, secrets representation, UI, and internal types were not
copied.

## FDE brochure — international manufacturing references (2026-08-25)

Slide 9 of the FDE brochure uses authentic company names/marks only as editorial
identification for publicly documented industrial-AI practices. Their inclusion
does not imply that Siemens, Bosch, Schneider Electric, or ABB is an FDE customer,
partner, or endorser.

- Siemens: official Industrial Copilot and industrial-AI press materials,
  https://press.siemens.com/global/en/pressrelease/siemens-introduces-ai-agents-industrial-automation
- Bosch: official Industrial AI and manufacturing materials,
  https://www.bosch.com/research/bcai/industrial-ai/
- Schneider Electric: official Industrial Copilot manufacturing announcement,
  https://www.se.com/ww/en/about-us/newsroom/news/press-releases/Schneider-Electric-unveils-next-generation-agentic-manufacturing-capabilities-powered-by-Microsoft-Azure-AI-at-Hannover-Messe-2026-69e08de2ddabef15890a48f3/
- ABB: official Genix Copilot product materials and official ABB logo asset,
  https://new.abb.com/process-automation/genix/abb-genix-copilot and
  https://new.abb.com/DotNetWidgets/docs/default-source/about/abb-logo

For reliable build-time retrieval, the four authentic trademark files may be
downloaded from their Wikimedia Commons file redirects (Siemens-logo.svg,
Bosch-logo.svg, Schneider_Electric_2007.svg, and ABB_logo.svg). Wikimedia is
used only as the file transport source; company identity and usage context are
verified against the official corporate sources listed above.

Any downloaded brand marks are retained only in the brochure build workspace
for this editorial comparison slide; they are not Company OS or FDE brand assets.

## FDE brochure — additional international manufacturer marks (2026-08-25)

Slide 9 adds a second editorial-reference row using authentic marks for Toyota,
BMW, Honeywell, and Caterpillar. Their presence identifies real international
manufacturers only and does not imply an FDE customer, partner, or endorsement
relationship. Build-time files are sourced through these Wikimedia Commons
file pages, whose source metadata attributes the marks to the respective brand
owners:

- https://commons.wikimedia.org/wiki/File:Toyota_logo.svg
- https://commons.wikimedia.org/wiki/File:BMW.svg
- https://commons.wikimedia.org/wiki/File:Honeywell_logo.svg
- https://commons.wikimedia.org/wiki/File:Caterpillar_logo.svg

## FDE brochure — approved orange cover visual (2026-08-25)

The cover visual for the Chinese and English FDE brochure is a user-provided
abstract orange raster image approved in the conversation. It is used only as
the brochure cover artwork and does not depict a real product, company, person,
or factual claim.

- Source file: `/Users/elliottye/Desktop/exec-eaa585b7-6630-4b2c-bcab-341d9bb5e79c.png`
- Provenance: supplied and approved by the user

## FDE brochure — Feishu contact QR code (2026-08-25)

Slide 12 uses a user-provided Feishu contact QR code as the direct contact
mechanism. The brochure build crops the supplied contact-card screenshot to the
QR code itself, retaining its white quiet zone and excluding the displayed
personal/company text and redundant caption.

- Source file: `/Users/elliottye/Downloads/IMG_0263.JPG`
- Provenance: supplied by the user for placement in the brochure
- Use: FDE brochure slide 12 contact QR code only

## Company OS film — official Leico wordmark (2026-09-02)

The `Follow the Light` end card uses the user-supplied Leico wordmark as an
official project brand asset. The wordmark is cropped deterministically from
its white background; its lettering and accent mark are not regenerated or
redrawn.

- Source file: `/Users/elliottye/Desktop/img_v3_02155_d79d851e-f25b-4568-b491-a006b6de757g.jpg`
- SHA-256: `20843be10344564fb5216deba328cdbe0dbbbfb7b901602e5de9cb118bec46df`
- Provenance: supplied by the user for the Company OS end card
- Use: Company OS / Raft / Leico end-card composition only
