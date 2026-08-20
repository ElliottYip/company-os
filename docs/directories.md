# Directory guide

```text
company-os/
├── core/             Domain entities, invariants, office scene compiler
├── application/      Use cases and deterministic Demo runtime
├── ports/            Replaceable identity/data/execution/approval/etc. contracts
├── adapters/         Demo, deployment, identity, HTTP, storage, and Connector edges
├── connector-sdk/    Provider-neutral versioned connector contract
├── web/              Standalone Vite shell, host mount, DOM adapter, owned assets
├── tests/            Focused unit/integration tests plus real-browser E2E
├── scripts/          Dependency-boundary guard
└── docs/             Charter, roadmap, ADRs, provenance, migration, handoff
```

`web/dist/` and `node_modules/` are generated and ignored. No directory links to
the Raft source tree. `outputs/` is reserved for user-facing deliverables and is
not part of the runtime package.

`research/paperclip` contains non-shipping competitive-audit evidence. It is not
part of the product build, test, service, deployment, or supported adapter set.
`adapters/http` owns transport and process concerns. Neither may be imported by
`core`, `ports`, or `application`.
