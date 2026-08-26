# Company OS contributor rules

## Product boundary

Company OS is an independent AI-native company control plane. Raft Agent,
Codex, DeepSeek, and enterprise agents connect through equal connector
contracts. Raft is an adapter and optional host, never a domain dependency.

## Required dependency direction

`core <- ports <- application <- adapters/web`

- `core` imports no Company OS layer and no vendor SDK.
- `ports` may import domain types from `core` only.
- `application` may import `core` and `ports` only.
- `adapters`, `web`, and `connector-sdk` may depend inward; inward layers must
  never import them.
- Never introduce Raft Agent, Buzz/Raft UI, NIP-07, Nostr event kinds, or relay
  concepts into `core`, `ports`, or `application`.

## Commands

- Install: `npm install`
- Develop: `npm run dev`
- Test: `npm test`
- Type check: `npm run typecheck`
- Boundary check: `npm run check:boundaries`
- Build: `npm run build`
- Full verification: `npm run verify`

## Conventions

- TypeScript strict mode, ESM, named exports.
- External input is validated at adapters and connector SDK boundaries.
- Demo and fixture data must be explicitly labelled; never imply it is live.
- Never commit credentials or production data. User-authorized paid 3D
  generation, project-owned GLB assets, and a lightweight 3D runtime are
  allowed when provenance, cost, and validation are recorded.
- Managed-cloud and self-hosted are deployment profiles of one codebase.
- Update `docs/source-manifest.md` before copying any external visual asset.
