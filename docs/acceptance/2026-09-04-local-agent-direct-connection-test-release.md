# Local Agent direct-connection test release

Date: 2026-09-04
Status: **REPOSITORY-QUALIFIED LOCAL CANDIDATE; IMMUTABLE PUBLICATION NOT YET AUTHORIZED**

## Release outcome

This candidate closes the invisible first-use gap for direct Agent Node
connections:

- the public front door now exposes **Connect local Agent**;
- Demo/local draft, restricted formal access and the formal governance page
  all retain an actionable connection entry;
- the formal connection center distinguishes no-runtime, discovered,
  unhealthy and registered states;
- registration remains a revision-checked, credential-free company command;
- `npm run agent:preflight` returns bounded READY/BLOCKED evidence without
  printing the Agent Node address, bearer value or arbitrary remote errors;
- desktop and mobile browser checks cover the entry, and formal browser
  admission covers discovery through registration.

## Supported boundary

The candidate supports the existing neutral HTTP Connector when the Company OS
API can reach the Agent Node: self-hosted loopback, an approved private network,
or another explicitly network-reachable deployment.

It does **not** support binding a laptop behind NAT to `anc.raft.xin`. That
requires a separately designed outbound Agent Bridge with one-time enrollment,
device credential rotation/revocation, durable work polling, node-to-Agent
binding and restart-safe evidence. The Web explicitly states this gap.

## Current-run evidence

- Focused i18n, interaction and workbench tests: PASS.
- Local Agent preflight unit tests: 3 passed.
- Actual local preflight: BLOCKED as expected; Codex CLI `0.144.1` was found,
  while Connector package, authentication source and Agent Node address were
  not configured in the development shell.
- Production Web build: PASS.
- Browser entry test at desktop and mobile widths: PASS, zero console errors.
- Formal discovery and registration browser flow: PASS; request body contained
  `connectorId`, `executionResidency` and `expectedRevision` only.
- Repository unit/integration suite with local networking enabled: 814 tests,
  808 passed, 6 explicit external-environment skips, 0 failed.
- Final `npm run verify`: PASS on 2026-09-04. It repeated the 814-test
  unit/integration result, passed architecture-boundary, independence,
  research, protocol, Connector-bundle and Web-interaction checks, found no
  production dependency vulnerabilities, passed the secret scan, TypeScript
  check and production build, then completed 23 browser tests with 5 explicit
  external-environment skips and 0 failures.

## Rollout plan

1. Publish immutable API/Web/Agent Node images and a source tag only after the
   exact committed tree passes release CI.
2. Deploy to an isolated self-hosted test environment with the feature visible.
3. Run `npm run agent:preflight`; proceed only on READY.
4. Sign in as an authorized administrator, open **接入与治理 -> Agent 接入**,
   register the discovered runtime and verify HEALTHY.
5. Admit one synthetic read-only Work, confirm ordered progress, evidence,
   result and idempotent replay, then restart the API and confirm recovery.
6. Hold the release if any new client error appears, readiness becomes
   unavailable, or Connector registration/dispatch error rate exceeds the
   existing baseline.

## Monitoring

- `/ready` dependency state for Agent Connector health;
- Connector delivery outcome and redrive depth;
- formal command error rate for runtime registration;
- client JavaScript errors on the governance page;
- Work completion, timeout and `OUTCOME_UNKNOWN` rates.

No hostname, company ID, Work ID, Agent ID or credential is added as an
unbounded metrics label.

## Rollback

The change adds no database migration and does not alter existing Connector or
Work records. Rollback is application-only:

1. restore the prior immutable Web and API images;
2. verify `/health` and `/ready` against the retained release identity;
3. confirm existing registered Connector rows and pending outbox records are
   unchanged;
4. retain this failed candidate and its browser/preflight evidence for review.

Do not delete company catalogs, revoke runtime credentials, or roll back the
database merely to remove the new connection UI and preflight command.

## Publication gate

This dirty working tree contains pre-existing user changes overlapping Web,
deployment, Connector and test files. Creating a release commit or immutable
manifest from it would absorb unrelated work and is therefore intentionally
not done automatically. Publication requires an explicit clean source commit,
qualification run and digest-addressed images.
