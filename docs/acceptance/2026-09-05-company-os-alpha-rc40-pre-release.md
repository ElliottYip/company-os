# Company OS Alpha RC40 pre-release qualification

Date: 2026-09-05
Status: **REPOSITORY-QUALIFIED; IMMUTABLE PUBLICATION PENDING**

## Outcome

This candidate is the first Company OS Alpha in which the current product
journeys and the selected ANC-relevant governance capabilities are accepted as
one release. It closes the create-first/bind-later ambiguity by making Runtime
attachment a reviewed relationship: a user can register a Runtime, create an
unbound Agent, choose that exact Agent from the Runtime record, and arrive at a
preselected binding review. Every readiness blocker has an owning destination.

The same release includes the unified Agent dossier, per-Work authority truth,
bounded Runtime Trace and Access Map, policy alerts and containment, AI Case,
AI Asset inventory and impact, evaluation, verified cost/value, Shadow AI, and
history-preserving duplicate review.

## Current-run qualification

- `npm run verify`: PASS on the exact pre-release working tree.
- Unit/integration: 847 tests; 841 passed, 6 explicit external-environment
  skips, 0 failed.
- Browser: 34 tests; 29 passed, 5 explicit external-environment skips, 0
  failed.
- Product layout: all 17 accepted sections passed at 390×844, 768×1024, and
  1440×1000; expanded task and Agent surfaces also passed bounds, action
  reachability, Escape, focus return, and keyboard focus checks.
- Security: repository secret scan passed across 1674 text files; production
  dependency audit reported 0 vulnerabilities.
- Architecture, independence, research provenance, OpenAPI generation,
  Connector bundles, Web interaction semantics, TypeScript, and production Web
  build all passed.
- Real Connector: the project-owned authenticated local HTTP Agent Node ran the
  real Codex CLI through approval pause and recovery, completed the exact
  Attempt, and emitted a bounded `codex-cli / EXECUTE_READ_ONLY` Runtime Trace.

The authoritative phase records are under `docs/acceptance/alpha/`; screenshots
and responsive findings are under
`docs/audits/2026-09-05-alpha-flow-audit/`.

## Explicit boundary

This is an Alpha release candidate, not customer production acceptance. It does
not claim hosted laptop pairing through NAT, a customer staging deployment,
production telemetry, enterprise data access, a full CMDB/SPM/PPM replacement,
or compliance packages without customer requirements. Demo remains labelled
and cannot perform formal mutations. Cost and value are unavailable unless
their evidence is verifiable; unpriced Connector usage remains unpriced.

## Rollout and monitoring

1. Let the tag-triggered workflow qualify the exact source revision before any
   public Release exists.
2. Publish only the six digest-addressed images, their SBOM/provenance, release
   manifest, and application SBOM produced by that workflow.
3. Install into an isolated Alpha environment using the retained release
   bundle and keep ordinary dispatch frozen until dependency, migration,
   product-start, and acceptance authorities are separately satisfied.
4. Admit one synthetic read-only Work and monitor `/health`, `/ready`, delivery
   outcomes, outbox depth, approval pause/resume, completion, timeout,
   `OUTCOME_UNKNOWN`, risk alerts, and client errors.
5. Hold rollout on release-identity drift, a new client error, missing
   readiness, unresolved Work, or a failed containment/recovery transition.

## Rollback

Rollback is an explicit promotion of the retained `v0.1.0-rc.39` release; no
tag is moved and no candidate database is destructively rewritten. Before
traffic moves, preserve the active database and release state. If RC40 fails,
route back only after the previous immutable Web/API endpoints prove their
release identity and the previous state digest passes the repository cutover
contract. Retain the failed candidate, Runtime evidence, and partial operation
records for investigation.

## Publication gate

Create `v0.1.0-rc.40` only from the clean committed source tree. The release is
complete only when the tag-triggered `release` workflow finishes both
qualification and publication and the GitHub prerelease contains the generated
manifest and SBOM. Never reuse or move `v0.1.0-rc.38` or `v0.1.0-rc.39`.
