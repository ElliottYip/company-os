# Competitor architecture report

Status: in progress  
Evidence date: 2026-08-18

This report grows only when a repository unit is complete. Marketing or README
claims are never promoted to implemented architecture without matching source,
data, lifecycle and test evidence.

## Agent Compiler

Pin: `81f1e81ba5d82ed38408bba09e0c104209c1d9cc`  
Repository: `thetpmguy/agent-compiler`  
History at pin: seven commits over nine days, no tag or release  
License: no license file or other grant; copying prohibited

### Whole-repository coverage

All 9 tracked paths and all 6 generated units were read. The repository contains
two Finder metadata files, `.gitignore`, README and contributing documents, one
21-line Python route module, a four-line dependency list, and two example data
files. It has no frontend, database, schema, migration, event, queue, worker,
permission layer, audit store, plugin SDK, runtime adapter, deployment file, CI
workflow or test.

### Actual executable architecture

```text
POST /compile
  -> FastAPI route compile_intent(intent_yaml: string)
  -> yaml.safe_load
  -> fixed dictionary: retrieve / draft / review / publish
  -> JSON response
```

There is no service/application layer or typed domain model. `pydantic` is
declared but unused. The route assumes parsed YAML is a mapping and does not
define authentication, tenancy, authorization, payload constraints, error
codes, idempotency or lifecycle.

### Claimed versus implemented

| Capability | Source result |
|---|---|
| Intent ingestion | implemented only as an untyped YAML string body |
| Deterministic topology selection | roadmap only |
| Topology library | documentation only |
| Deep-agent specialization | documentation only |
| Tool registry/contracts | documentation and example fields only |
| Policy/guardrail engine | documentation only |
| Simulation and validation | documentation only |
| Baseline/diff versioning | roadmap only |
| Publish workflow | name appears in fixed step list; no workflow |
| Approval | constant `requires_approval: true`; no actor, action binding or state |
| Runtime export adapters | roadmap only |
| Tests | absent |

The example `compiled_plan.json` contains a five-step topology and risk level
that the backend cannot generate. It is illustrative fixture data, not run or
test evidence.

### Company OS judgment

- Code: **REJECT**. It is unlicensed, untyped and lacks the named compiler.
- Design: **REFERENCE ONLY** for one idea—the design-time policy/organization
  layer should be distinct from execution runtime.
- Responsibility conflict: a boolean approval flag cannot represent accountable
  human authority or bind an exact action, digest, evidence and result.
- Potential product question retained for later synthesis: whether Company OS
  needs a typed, versioned organization/policy IR with preview, diff, validation,
  publication and rollback. This is a question, not a confirmed product thesis.

Permanent path and symbol evidence is recorded in
`research/competitive-audit/assessments/agent-compiler.json`.
