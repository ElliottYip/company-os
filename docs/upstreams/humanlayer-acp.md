# HumanLayer Agent Control Plane upstream record

- URL: https://github.com/humanlayer/agentcontrolplane
- Audit pin: tag `v0.5.1`, commit `bc703d36579edb973da1ca2a748381cdb4eb8b55`
- License: Apache-2.0, verified from the repository LICENSE
- Decision: **REJECT**

Code evidence: 241 files and 35 test/spec paths. The implementation is a
Kubernetes controller/CRD system for Agent, Task, ToolCall, MCPServer and
ContactChannel resources. The audited release dates to 2025-04-17 and approval
semantics depend on HumanLayer ContactChannel. This is the wrong operational and
identity boundary for the current dual-profile product.

