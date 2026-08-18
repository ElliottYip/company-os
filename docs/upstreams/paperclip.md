# Paperclip upstream record

- URL: https://github.com/paperclipai/paperclip
- Audit pin: tag `v2026.817.0`, commit `213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`
- Compared HEAD: `b446ff59bfd4c22ce8042f0a8a5daad5c7adc02c`
- License: MIT, copyright Paperclip AI; notice required with distributed copies
- Decision: **ADOPT** as the single generic work substrate, subject to ADR 0007

## Code evidence

The pin contains 32 workspace projects, 4,464 tracked files, 1,295 paths named
as tests/specs, 232 migration-related files and 10 CI workflows. Schema and
services cover company tenancy, agents, issues, goals, runs, budgets, approvals,
memberships, permission grants, secrets, artifacts and plugin state. Authorization
uses company scoping, hashed board/Agent keys, responsible-user attribution,
membership checks and cross-tenant existence-oracle guards. Execution code uses
idempotency records, row locks, leases, compare-and-clear and bounded recovery.

The Plugin SDK provides versioned JSON-RPC, company-scoped invocation metadata,
capability-gated host calls, state/entity stores, events, jobs, tools and UI
slots. Its specification retains approval, auth, issue checkout and budget
invariants in Paperclip core. Plugin UI is same-origin trusted code, not a
sandbox or security boundary.

Headless evidence: `server/src/app.ts` defines `UiMode = "none" | "static" |
"vite-dev"`; `server/src/index.ts` chooses `none` when `serveUi` is false;
`server/src/config.ts` maps `SERVE_UI=false`; API routes are registered before
optional static/Vite UI middleware; the startup banner labels this mode
`headless-api`. Company OS therefore does not need Paperclip pages or their
English copy. This finding is required to retain **ADOPT** status.

## Verification and risks

- Lockfile install completed with pnpm 9.15.4 and lifecycle scripts disabled.
- db/shared/Plugin SDK/server `tsc` checks passed after building SDK output.
- Selected Vitest run: 27 passed, 28 skipped by environment, 11 could not run
  because the sandbox forbids Supertest binding `0.0.0.0`; re-run in an isolated
  approved runner.
- Migration safety TypeScript was inspected but not executed because external
  execution of untrusted upstream scripts was denied by the safety gate.
- `pnpm audit --prod`: 99 advisories (1 critical, 35 high, 53 moderate, 10 low).
- The stable pin to observed HEAD is 176 commits and 850 changed files; never
  track master and avoid a fork.
- Root lock configuration patches `embedded-postgres` and `acpx`, increasing the
  upstream-specific maintenance surface.
- Company OS patch ledger: zero upstream-core patches at audit time. The 4–6
  week version train and conflict budget are in `paperclip-patch-ledger.md`.

Allowed reuse and prohibited brand/private-API reuse are defined in
`docs/upstream-adoption-plan.md`.
