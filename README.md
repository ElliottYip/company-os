# Company OS

Independent AI Native Company control plane for humans, agents, permissions,
approvals, evidence, and responsibility.

## Run the phase-one scaffold

```bash
npm install
npm run dev
```

The default page is a deterministic fixture demo. It does not invoke a model,
agent, relay, tool, filesystem, credential, or production data source.

## Verify

```bash
npm run verify
```

This runs focused tests, dependency-boundary checks, strict TypeScript checking,
and an independent Vite production build.

Start with [the product charter](docs/product-charter.md),
[architecture](docs/architecture.md), and [source manifest](docs/source-manifest.md).

