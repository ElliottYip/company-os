# Company OS Alpha RC41 pre-release qualification

Date: 2026-09-05
Status: **REPOSITORY-QUALIFIED; IMMUTABLE PUBLICATION PENDING**

RC41 carries the complete Alpha scope and evidence described in the RC40
candidate, plus the release-environment regression correction discovered by
RC40. The real PostgreSQL/OIDC browser test now follows the same authoritative
journey as the product:

1. register the Runtime;
2. create the Agent explicitly unbound;
3. choose that named Agent from the registered Runtime record;
4. verify that the exact Runtime is preselected;
5. enter a reason and commit the reviewed binding; and
6. activate responsibility and lifecycle approval before execution.

The corrected CI-only test was reproduced locally against a disposable pinned
PostgreSQL 16.15 container and passed in a real browser. The container was
removed after the run. RC40 remains an immutable failed tag with no images or
GitHub Release. RC41 must pass the full tag-triggered qualification, publish six
digest-addressed images with SBOM/provenance, and create a prerelease containing
the generated manifest and application SBOM before publication is complete.

Rollback remains an explicit return to retained `v0.1.0-rc.39`; neither RC40 nor
RC41 may move an existing tag or destructively rewrite database state.
