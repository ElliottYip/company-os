# Paperclip headless contract audit

Audit pin: `v2026.817.0` / `213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`  
Decision: backend **ADOPT**; customer React UI **DO NOT ADOPT**  
Corrected governing document: 264 lines, SHA-256
`71cb62a708a5c3bf7b26d9a3c95e11b4d6a4c32bf4b45d4467fdad80cea89141`

## Can it really run headless?

Yes. `server/src/app.ts` defines `UiMode` with a `none` value,
`server/src/config.ts` maps `SERVE_UI=false`, and `server/src/index.ts` starts
with `uiMode: "none"`. API routes are mounted independently of the optional
static/Vite middleware. The startup banner calls this `headless-api`.

Paperclip's customer-relevant UI does not require private server imports. Its
`ui/src/api` layer makes 585 non-test REST client calls, and live updates use
`/api/companies/:companyId/events/ws`. This is sufficient evidence that a
separate Company OS Web can issue the same commands and consume projections.

## API, client, event, and Plugin surfaces

- The server publishes OpenAPI 3.0 at `/api/openapi.json` with documented cookie,
  board-key, and Agent-bearer security schemes.
- `openapi-routes.test.ts` compares mounted literal routes with the generated
  specification and requires exact coverage. Experimental `pipelines`, `cases`,
  and `smoke-lab` routes are explicitly excluded and are not adoption contracts.
- The upstream UI has a handwritten typed fetch layer, not a generated public
  client package. Company OS should generate or maintain its own version-pinned
  boundary client from OpenAPI rather than import UI files.
- The REST namespace is `/api` and the document reports `1.0.0`, but paths are
  not URL-versioned. Compatibility tests and the pinned version train therefore
  remain mandatory.
- Company-level WebSocket events are authenticated and typed, but use a
  process-local emitter and a process-local incrementing ID. There is no cursor
  handshake or replay. On reconnect the upstream UI invalidates/refetches its
  authoritative queries because missed events “can't be replayed yet.”
- Durable per-run events are separately available through
  `GET /api/heartbeat-runs/:runId/events?afterSeq=...`; Company OS uses that
  sequence API for evidence/recovery and treats WebSocket events only as cache
  invalidation hints.
- The Plugin SDK is a viable official extension surface for JSON-RPC,
  capabilities, events, jobs, tools, and plugin state. Same-origin Plugin UI is
  trusted code and is never an identity or approval boundary.

## Frontend-local state

Business-authoritative projections already exist server-side for dashboard,
attention, artifacts, budgets, approvals, live runs, and run events. Most UI
derivation is presentation-only: labels, icons, severity tones, transcript
grouping, and React Query invalidation.

Three items must not be copied into the Company OS Web as authority:

1. `ui/src/lib/attention.ts` maps source kinds into `blocking` versus `review`
   locally. Company OS Agent Boss needs its own responsibility/risk projection,
   or an upstream server projection if this categorization becomes operational.
2. The same file documents a server feed gap where approval metadata may carry
   an issue ID without the related issue projection. Fix this server-side or
   handle it as an unavailable link; do not reconstruct it by private DB access.
3. Recursive blocker and cron preview helpers mirror server logic. They may be
   used only for display previews; dispatch, approval, and recovery decisions
   must use server state.

## Error stability finding

The central error handler emits `{ error, code?, details? }`, and several
security/tool flows already provide stable codes. Coverage is not uniform:
the audited route sources contain 492 direct `{ error: "English text" }`
responses, Zod failures have no stable code, and the upstream UI sometimes
branches on HTTP status or English message fragments (for example document
locking and approval-required flows).

This is not a backend-adoption blocker, but it is a production UX gate:

- Company OS never translates or branches on upstream English strings.
- `adapters/paperclip/error-contract.ts` preserves an upstream code when present
  and otherwise emits only a coarse `UPSTREAM_HTTP_<status>` category.
- Any Company OS product decision that needs finer behavior requires a stable
  upstream code, preferably contributed upstream with an OpenAPI response
  schema. Until then, the flow may show a generic failure and remain gated.
- User input, Agent output, evidence, and external logs retain their original
  text; localization is a future derived view, not persistence mutation.

## Minimal Company OS adapter

```text
Company OS application
  -> GenericWorkPort (Company OS types and opaque IDs)
    -> Paperclip anti-corruption adapter
      -> version-pinned OpenAPI client
      -> REST projections and commands
      -> WebSocket cache hints
      -> durable run-event sequence reconciliation
```

The adapter validates all upstream responses, owns the Company OS ↔ upstream ID
mapping, adds idempotency keys where supported, sanitizes event attributes, and
normalizes errors. It must not import upstream database, server, or React types.

## Duplicate implementation stopped

Paperclip is the canonical owner, so Company OS stops production implementation
of generic Task/Goal/Run/Heartbeat/Budget/Artifact storage and scheduling.

- `core/work.ts` remains only for accountable-human, allowed-action, and
  responsibility-contract validation; it is not a second task engine.
- `application/company-operations.ts` remains the differentiated responsibility
  and exact-approval flow; generic scheduling/state moves behind
  `GenericWorkPort`.
- `adapters/demo/*` and fixture connectors remain deterministic Demo and
  conformance fixtures, never production Agent/runtime claims.
- Company OS event/evidence stores remain authoritative only for responsibility,
  data authorization, approval binding, evidence, Demo, and Office projections.

No current differentiated module should be deleted before the read-projection,
controlled-dispatch, backup, and rollback compatibility gates pass.
