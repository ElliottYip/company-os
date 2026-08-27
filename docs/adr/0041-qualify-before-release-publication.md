# ADR 0041: qualify before release publication

Status: accepted, 2026-08-26.

## Context

The first release workflow started when a GitHub Release was already published.
Its qualification and image publication were strict, but a failed qualification
could leave a public release page that had no admitted images, manifest or SBOM.
That reverses the authority order: a public release is a result, not the trigger
for proving that a source revision is releasable.

Paperclip's mature release and deployment boundaries are a useful operational
reference here, while Company OS retains its own images, schema, evidence and
release lifecycle.

## Decision

An exact `vMAJOR.MINOR.PATCH[-PRERELEASE]` tag is the only release trigger. The
workflow serializes by tag and refuses cancellation in progress. It then:

1. validates that the tag resolves to the checked-out source revision;
2. runs the complete credential-free and disposable-infrastructure
   qualification job with read-only repository permission;
3. enters the protected `production-release` environment;
4. builds and publishes every release-manifest image as an independently
   attested artifact (six images as of RC4);
5. creates the digest-bound release manifest and application SBOM; and
6. creates the GitHub Release only after all earlier evidence exists.

The manifest retains the exact repository, tag, workflow path, event and
qualification run/attempt URI. These are public provenance coordinates, not an
authorization token or a claim that later staging acceptance has passed.

A prerelease suffix such as `0.1.0-rc.1` produces a GitHub prerelease. Runtime
consumers continue to use image digests rather than tags. A failed run may leave
diagnostic workflow state or unreferenced registry artifacts, but it cannot
claim a successful Company OS Release.

## Consequences

Release publication is now the terminal evidence step. A rerun cannot silently
replace an existing GitHub Release because `gh release create` fails when the
tag already has one. The repository and protected environment still need to be
provisioned externally before the first RC can actually be published.
