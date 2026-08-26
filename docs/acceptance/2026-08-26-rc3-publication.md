# v0.1.0-rc.3 public release evidence

Date: 2026-08-26  
Status: `RELEASED_NOT_STAGING_ACCEPTED`

This record distinguishes successful public release publication from customer
staging or production acceptance. It contains no credential, customer data or
self-attested claim about an external environment.

## Accepted release

- tag: `v0.1.0-rc.3`
- source revision: `c6594d375c8ccee3f42ca76a614b1207db0075f2`
- release: <https://github.com/ElliottYip/company-os/releases/tag/v0.1.0-rc.3>
- qualification run: <https://github.com/ElliottYip/company-os/actions/runs/32936951504>
- protected environment: `production-release`
- license: Apache-2.0, Copyright 2026 Yilun Ye

The qualification and publish jobs completed successfully. The publish job
built and published the API, Web, operations, Codex Agent Node and Vault Secret
Broker images; emitted one public provenance attestation for each image;
generated and parsed the release manifest and CycloneDX SBOM; attested the
manifest; retained workflow evidence; and only then created the prerelease.

## Evidence digests

- release manifest: `sha256:51730e614dc51d867be1326a52b219e4d1687bf8159946d25ffd5c7ef69bf3c3`
- CycloneDX SBOM: `sha256:44dfe6eb7fce8c77ff38fad5bfa28c7a40b9ad888352e62d493ea8d412b70316`
- staging bundle manifest: `sha256:21e9d95d5461d0ed47071beee9fd8f8555ede14c4ed9b04bb159db8db0d0f489`
- local transfer archive: `sha256:97a7c70ccbcc1f6c12ab5ff04fc8d9045ab6f4cbd1765b519c7371274093df4b`

The downloaded release manifest and SBOM parsed independently. Their hashes
matched the GitHub Release API, and the SBOM identified CycloneDX 1.5 with 61
components. The public attestation API returned one attestation for each of the
five exact image digests. The locally generated staging handoff was accepted by
the mutation-free installer plan as release ID
`0.1.0-rc.3-c6594d375c8c`.

## Image coordinates

- API: `ghcr.io/elliottyip/company-os-api@sha256:12128b72036aec82632627333e1f62d4225bac5a3cf4f37eaaf37fd9c69a6480`
- Web: `ghcr.io/elliottyip/company-os-web@sha256:eac190adad53e0ce64d43317bfd6dc68c101d6b92ebbaa3cdc7b2b38957403d1`
- operations: `ghcr.io/elliottyip/company-os-ops@sha256:f114a4ffdd8105a80f1ceec743512b2e67909f2eaa6fe856fa73600fa1a392e4`
- Codex Agent Node: `ghcr.io/elliottyip/company-os-codex-agent-node@sha256:2b38f77b81f11e466773f4d766be47389f92a88c9bb1ae96685073aff44bf22e`
- Vault Secret Broker: `ghcr.io/elliottyip/company-os-vault-secret-broker@sha256:b418adf09d2eade7d7582bb92a9a300b15e90207c24c5f2266f81ba5fdf00987`

## Earlier immutable attempts

- `v0.1.0-rc.1` remains an auditable failed prerelease attempt. Its publish job
  stopped before image publication because the default Docker driver could not
  emit the required attestations.
- `v0.1.0-rc.2` remains an auditable prerelease whose images were published,
  but whose manifest and SBOM assets were invalid JSON because `npm run`
  banners contaminated redirected stdout.

Neither tag was moved, deleted or presented as the accepted release. RC3 adds
an attestation-capable Buildx builder, silent JSON generation and an explicit
parse gate before publication.

## Remaining boundary

This evidence proves a reproducible public candidate release. It does not prove
customer staging, real enterprise OIDC, external PostgreSQL, Vault, Agent/Data
Nodes, off-site backup, recovery, ingress or either required upgrade cycle.
Those remain governed by `docs/staging-raft-xin.md` and
`docs/customer-boundary-acceptance.md`.
