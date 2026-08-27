# ANC public exhibition Demo runbook

Status: RC8 and RC10 retained after browser admission failures; RC9 retained after qualification failure
Target: RC11 or later with the complete production-Web runtime API injection

## Safety boundary

The exhibition Demo is an explicit fixture-only profile. It uses no paid
model, external collaboration platform, enterprise data, production Secret, or
production credential. `COMPANY_OS_PUBLIC_DEMO_ENABLED` defaults to `false` and
must be set to `true` only in the separately approved Demo candidate
environment. Formal routes still require enterprise OIDC. A Demo cookie is
rejected before any `/api/v1` handler.

RC4, RC5, and RC6 releases, both sites' prepare-only evidence, image
verification, and operations evidence are immutable inputs. Do not replace
their directories, tags, manifests, images, or evidence. RC7 is installed as a
new Hong Kong candidate and remains `PREPARED_NOT_STARTED`.

## Local admission

```sh
npm install
npm run verify
```

For a quick operator rehearsal, run the same two servers used by browser
admission:

```sh
COMPANY_OS_PORT=4310 \
COMPANY_OS_RUNTIME_MODE=public-demo \
COMPANY_OS_PUBLIC_DEMO_ENABLED=true \
COMPANY_OS_WEB_ORIGINS=http://127.0.0.1:4173 \
npm start

npm run dev -- --host 127.0.0.1 --port 4173
```

The first command contains no formal OIDC or database configuration and is a
local fixture rehearsal only. It is not the Hong Kong deployment procedure.

## Three-minute visitor path

1. Select **Explore a live demo company** and confirm the Demo Fixture label.
2. On Dashboard, compare Personal, Shared, and Federated counts and management
   depths.
3. Open Agents; confirm Personal Agents show Inventory and no private Work.
4. Open Work; inspect the bounded Observed source record and return reference.
5. Inspect the Federated workspace/run and confirm external execution ownership.
6. Trigger the Governed workflow and confirm it pauses for a high-risk action.
7. Approve or reject as the accountable human; inspect evidence, cost, and the
   responsibility chain.
8. In Usage & Billing, submit one credential or subscription renewal request.
9. Switch between Chinese and English and check a tablet-width viewport.
10. Reset Demo and confirm the fixture returns to generation-one state for that
    visitor without changing another browser session.

## Multi-visitor and recovery checks

- Open two clean browser contexts, create one Demo company in each, mutate only
  the first, and confirm the second has no renewal or approval change.
- Refresh and confirm the opaque HttpOnly cookie restores the same visitor
  state while it remains valid.
- If a session expires or the in-memory Demo process restarts, use the recover
  path to receive a new isolated fixture. Never attempt to recover a visitor's
  previous fixture by accepting a company ID from the browser.
- Reset affects only the current session. It does not delete formal company
  data or any other visitor session.
- If API health fails, withdraw the Demo route, restart the candidate API, and
  re-run the two-context isolation check before reopening. No external side
  effect needs reconciliation because the profile has none.

The current Demo Session adapter is process-local by design. Run exactly one
Demo API replica for the exhibition candidate. Horizontal scaling requires a
shared session-store adapter and is not silently assumed by this runbook.

The API applies a second safety boundary independent of the TLS proxy:

- `COMPANY_OS_DEMO_MAX_SESSIONS` defaults to 500 process-local sessions;
- `COMPANY_OS_DEMO_CREATIONS_PER_MINUTE` defaults to 120 new or anonymous
  recovery requests;
- `COMPANY_OS_DEMO_REQUESTS_PER_SESSION_PER_MINUTE` defaults to 240 requests
  per opaque session token;
- rate-limit state retains only a process-random salted SHA-256 digest of a
  session token, never a visitor IP or the raw cookie;
- expired sessions and limiter windows are reclaimed before admitting new
  entries, and the tracked-key set is capped at the session capacity.

Capacity or request-rate rejection returns `429 PUBLIC_DEMO_RATE_LIMITED` or
`409 DEMO_SESSION_CAPACITY_EXCEEDED`. Do not increase these values during an
incident. Withdraw ingress, verify memory and request-rate evidence, restart
the disposable Demo API if necessary, and repeat isolation/recovery admission
before reopening.

## Next-RC public Demo sequence

1. Merge the verified branch and create a new immutable RC tag only after
   release authorization.
2. Let the protected release workflow qualify and publish six digest-addressed
   images plus manifest, SBOM, and provenance.
3. Build and independently verify a Secret-free staging handoff bundle.
4. Transfer and install it into a new Hong Kong release directory using the
   existing prepare-only installer. Preserve RC4/RC5 and the active pointer.
5. Render `deploy/compose.public-demo.yml` with `COMPANY_OS_RUNTIME_MODE=public-demo`
   and `COMPANY_OS_PUBLIC_DEMO_ENABLED=true`. Do not supply or mount formal
   OIDC, Vault, database, model, data, or Agent Connector configuration.
6. Run database migration planning/preflight against the candidate contract.
   This slice adds event types but no destructive SQL migration.
7. Start the public Demo candidate only after its distinct start authorization.
8. Run health, three-minute journey, bilingual tablet, two-visitor isolation,
   reset, process-recovery, and formal-route-denial acceptance.
9. Move Demo traffic only after bounded observation. Do not promote formal mode,
   initialize real Agents, or change Hangzhou/DNS/TLS under this Demo approval.

RC8 completed publication, prepare-only installation, closed-ingress container
start, readiness, API journey, two-visitor isolation, reset, formal-route denial,
and process-recovery admission. A real production-Web browser then found that
Vite moved the application module ahead of `/company-os-config.js`; the Web
therefore sent Demo requests to its own static server and received `405`.
Public ingress was never opened. RC8 is retained as a failed candidate and must
not be routed. The application source now places runtime configuration in the
document head and `npm run build` mechanically rejects any built HTML where it
does not precede the module bundle. Publish and independently admit a later
immutable RC before changing traffic.

RC9 included that product fix, and its repository, identity, database, TLS,
Vault, soak, and browser qualification gates passed. Publication was correctly
skipped when both release-shaped profiles reached the Web image build: the
new build checker was not copied into `Dockerfile.web`'s build stage. The image
contract now copies that one checker explicitly, its Dockerfile assertion is
covered by unit tests, and both self-hosted and managed-cloud Compose admissions
pass locally. RC9 was never published or installed and remains immutable.

RC10 included both earlier fixes, passed the complete protected qualification,
published six attested images, and passed Hong Kong closed-ingress API,
isolation, governance, reset, recovery-boundary, and formal-route-denial checks.
Its production HTML also loaded the correct dynamic config before the module.
The real browser gate nevertheless found that `mountCompanyOS` constructed the
public Demo client with an empty base URL rather than the injected runtime API
origin, so the session POST reached the static Web server and returned `405`.
Public ingress was never opened. RC10 is retained as a failed candidate. The
Web mount contract now receives the runtime API origin explicitly and a
split-origin Playwright regression requires the session request to reach the
API origin. A later immutable RC must repeat the entire admission.

The authoritative RC8 failure record is
[`2026-08-27-anc-alpha-hk-rc8-loopback-failure.json`](acceptance/2026-08-27-anc-alpha-hk-rc8-loopback-failure.json).
The Secret-free closed-ingress environment is
[`2026-08-27-anc-alpha-hk-rc8-loopback.env`](acceptance/2026-08-27-anc-alpha-hk-rc8-loopback.env).
RC9 qualification evidence is
[`2026-08-27-anc-alpha-rc9-qualification-failure.json`](acceptance/2026-08-27-anc-alpha-rc9-qualification-failure.json).
RC10 browser failure evidence is
[`2026-08-27-anc-alpha-hk-rc10-browser-failure.json`](acceptance/2026-08-27-anc-alpha-hk-rc10-browser-failure.json).

## Evidence to retain

- source revision and next immutable RC tag;
- six image digests, release manifest, SBOM, and attestations;
- handoff bundle digest and new candidate release ID;
- migration preflight and candidate health output;
- browser E2E report including two-context isolation;
- screenshots in both languages at desktop and tablet widths;
- reset and API-restart recovery observations;
- explicit confirmation that Demo endpoints cannot reach formal administration;
- incident log and rollback/candidate-withdrawal decision, if used.

The current state is `HK_RC10_CLOSED_INGRESS_BROWSER_ADMISSION_FAILED`, never
publicly routed or production-ready. Retain RC8 through RC10 and repeat the
complete browser and recovery admission with the next immutable candidate
before changing that state.
