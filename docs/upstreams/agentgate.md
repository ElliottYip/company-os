# AgentGate upstream record

- URL: https://github.com/agentkitai/agentgate
- Audit pin: tag `v0.15.0`, commit `b1e541a0bda1f6c6b3e94a209578d631a8c0f9c3`
- License: MIT, copyright Amit Paz
- Decision: **REFERENCE ONLY**

Code evidence: 413 files and 84 test/spec paths. It has TypeScript/Python SDKs,
policy engine, server, audit UI and decision security tests with SQLite/Postgres
schemas. Its primary domain is the same approval/audit category that Company OS
must canonically own, so it is not a production dependency.

