# Paperclip production security admission

Pin: `v2026.817.0` / `213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`  
Audit date: 2026-08-18  
Verdict: architecture **ADOPT**, production **BLOCKED**

## Reproducible audit

The authoritative package manager is the upstream-declared `pnpm@9.15.4`.
Running a global pnpm 11 is invalid because it warns that the upstream
`pnpm.patchedDependencies` and `pnpm.overrides` fields are ignored.

```text
corepack pnpm audit --prod --json
critical 1 · high 35 · moderate 53 · low 10
```

The critical advisory is `node-tar` decompression/parse denial of service
(`1123940`), fixed in tar `>=7.5.19`. The path enters server/db/CLI resolution
through `drizzle-orm -> sqlite3 -> tar@6.2.1`. Source search found no direct
`sqlite3` import in the Paperclip server or DB packages, so it may be removable
optional/build graph rather than an exercised PostgreSQL request path. That is
not sufficient to waive it: the upstream Docker production stage copies the
entire build workspace after a full `pnpm install`, without pruning development
or optional dependencies. The vulnerable package is therefore present in the
shipped image unless an image/SBOM reachability test proves otherwise.

High findings include request-facing or enabled-package paths, not only tooling:
`path-to-regexp` under the Express server, `fast-uri` under server AJV,
`undici` under the Cursor Cloud adapter, and multiple tar findings. Findings
limited to Paperclip UI do not affect the Company OS Headless customer surface,
but the default Dockerfile sets `SERVE_UI=true`; the Company OS deployment must
override it to `false` and should build a pruned headless image before any UI-only
exception is considered.

## Admission requirements

Production remains blocked until a candidate stable tag satisfies all of these:

1. Build with the exact upstream package manager and patches.
2. Produce an SBOM for the actual headless runtime image, not the workspace.
3. Remove or upgrade all reachable critical/high packages; every exception must
   include path, exploit precondition, compensating control, owner, expiry, and
   an automated reachability assertion.
4. Run as non-root with `SERVE_UI=false`, a read-only application filesystem,
   bounded request/body/time limits, and no bundled unused Agent adapters.
5. Re-run tenant, auth, secret, error, migration, backup, rollback, and
   compatibility tests against that exact image digest.

Company OS will not patch Paperclip core to clear these findings. Preferred
resolution order is a newer stable tag, upstream dependency PR, or a separately
built pruned headless image using unmodified upstream packages. Any local core
patch triggers ADR 0007 reconsideration and Patch Ledger entry.
