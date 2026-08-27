# v0.1.0-rc.4 publication and staging handoff evidence

Status: **RELEASED_NOT_TARGET_VALIDATED**.

This record proves publication and a local Secret-free handoff. It does not
claim that Hong Kong or Hangzhou admitted the images, that a database was
migrated, that enterprise identity or a customer Connector was configured, or
that first start was authorized.

## Immutable release

- merge commit and source revision:
  `b9e58335eabab94de94b528b4cdb8834cf8faeae`
- annotated tag: `v0.1.0-rc.4`
- release: <https://github.com/ElliottYip/company-os/releases/tag/v0.1.0-rc.4>
- qualification and protected publish:
  <https://github.com/ElliottYip/company-os/actions/runs/33028743993>
- release manifest:
  `sha256:375cdbd5abfc5196e01ee8abbfb67925153783ee4203f1f6b9611616e0802389`
- CycloneDX SBOM:
  `sha256:aa780403607fd0d60d339faa55f12500f55899d78285f941c3ec755a0c5ce137`

The downloaded asset digests matched GitHub's release-asset digests. GitHub's
Attestations API returned one attestation for the release manifest and one for
each of the six image digests.

## Six immutable images

- API: `ghcr.io/elliottyip/company-os-api@sha256:923d49f444358b0d2a02892654e17f4edc7c0793a32a2d0b93616c42291cfbb0`
- Web: `ghcr.io/elliottyip/company-os-web@sha256:1660300fb1b448dfa990063b4fc100ef89e9c2fd51d18dec6181e13df4ea08aa`
- operations: `ghcr.io/elliottyip/company-os-ops@sha256:7858f9ce9518997081a112cba7a562642fc5383207330bd14366aeb8c272537f`
- Codex Agent Node: `ghcr.io/elliottyip/company-os-codex-agent-node@sha256:3e1fc91fed16e331641e55b2612d1646f9657dbca476f061994bc89c112ecd6b`
- Vault Secret Broker: `ghcr.io/elliottyip/company-os-vault-secret-broker@sha256:3b0b83c40b052a0446541d7b19bcf6712d99299dbbebc074d39f3a7725d16f94`
- fixture-only Reference Data Node: `ghcr.io/elliottyip/company-os-reference-data-node@sha256:6110995c7e1f001be6ef37efcdabd9847cdbf78011c9a14c328073e9430f5114`

## Secret-free staging handoff

The repository-owned bundle builder accepted the downloaded manifest and the
independent verifier returned `VERIFIED` for release `0.1.0-rc.4`, source
revision `b9e58335eabab94de94b528b4cdb8834cf8faeae` and bundle-manifest digest:

`sha256:632dcef1a5c8a8e6a3822e3e64592c36876a913344e501e1d9a6e62d748414db`

The bundle contains only the documented staging allowlist and explicitly says
`secretMaterialIncluded: false`. A portable archive was created and its file
set was independently listed; its current-run digest was
`sha256:1d20148ddecabca78219f51c3c2c4b23299f755bc05d4c5641ad154431fd1c6a`.
The archive digest is a transfer coordinate, not a replacement for the inner
bundle-manifest digest.

## RC3 to RC4 planning boundary

RC3 is an immutable five-image historical release. The cutover planner now
admits an absent previous `referenceDataNode` without inventing one, while the
current side still requires the RC4 digest. The real published manifests
produce cutover ID `cutover-d8b2fcef7c89170464190795`, status
`PLANNED_NOT_EXECUTED`, exact-prefix migration history, unchanged public
contracts and topology change `ADDED_FIXTURE_ONLY`. The generated plan digest
is:

`sha256:e4a009ad948c08c20778de789a2294aa27e4ecfcac5cbff22f389785e6226c55`

No cutover step was executed. RC3 remains retained for evidence and rollback;
its missing Data Node is recorded as `ABSENT_BY_RELEASE_CONTRACT`.

## Remaining gates

1. Verify all six registry objects by content on both targets and repeat
   prepare-only without Secret material.
2. Obtain an independent first-start authorization before creating runtime
   objects, injecting restricted Secret files or initializing dependencies.
3. Complete real staging identity, Connector, data, provider, responsibility,
   restart, backup/restore and browser acceptance.
4. Retain evidence for two actual immutable upgrades and their parallel
   rollback rehearsals.
