# Directory guide

```text
company-os/
├── core/             Domain entities, invariants, office scene compiler
├── application/      Use cases and deterministic Demo runtime
├── ports/            Replaceable identity/data/execution/approval/etc. contracts
├── adapters/         Demo, deployment, identity, HTTP, storage, and Paperclip edges
├── connector-sdk/    Provider-neutral versioned connector contract
├── web/              Standalone Vite shell, host mount, DOM adapter, owned assets
├── tests/            Focused behavior and boundary-facing tests
├── scripts/          Dependency-boundary guard
└── docs/             Charter, roadmap, ADRs, provenance, migration, handoff
```

`web/dist/` and `node_modules/` are generated and ignored. No directory links to
the Raft source tree. `outputs/` is reserved for user-facing deliverables and is
not part of the runtime package.

`adapters/paperclip` is an anti-corruption package, not a second domain layer.
`adapters/http` owns transport and process concerns. Neither may be imported by
`core`, `ports`, or `application`.
