# Third-party notices

This file distinguishes software/assets currently incorporated from candidates
that have only been audited.

The root Apache-2.0 license covers Company OS-owned contributions. It does not
replace third-party copyright, attribution, trademark, generated-asset provider
terms, or the separate MIT license carried by `skills/agentboss-school`.

## Incorporated

### OpenAI Codex CLI

The separately released Codex Agent Node image installs `@openai/codex` at the
exact version recorded in the release manifest. Codex CLI is distributed under
Apache-2.0 by OpenAI. Its source and license are available at
`https://github.com/openai/codex`. It is an execution-plane dependency only;
no Codex package or private runtime type enters Company OS core, ports,
application, database schema, or Web.

### Raft visual subset

Company OS contains approved, locally owned copies of the Raft visual subset
listed in `docs/source-manifest.md`. The source repository is Apache-2.0 and the
license copy is retained at `docs/licenses/RAFT-APACHE-2.0.txt`. Company OS does
not import the Raft repository at runtime.

## Audited but not incorporated

Paperclip, AgentOS, OpenWorker, Operant, Preloop, AgentGate, JamJet, Agent Room,
HumanLayer Agent Control Plane and awaithumans were inspected in temporary audit
checkouts. No source file, package, runtime image, name, logo or visual asset from
those candidates is currently distributed by this repository.

If a future module-level decision incorporates Paperclip code, its unmodified
MIT copyright and permission notice must accompany every distributed copy or
substantial portion. Apache-2.0 candidates would additionally require
license/NOTICE preservation and change marking. ADR 0008 requires per-file
provenance before any selective reuse; no audited competitor code is currently
incorporated.
