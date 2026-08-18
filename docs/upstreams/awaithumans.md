# awaithumans upstream record

- URL: https://github.com/awaithumans/awaithumans-human-in-the-loop-ai-agents
- Audit pin: tag `v0.1.11`, commit `05b73dbf8c9df7e79c3c585a95a897b0aeb775b1`
- License: Apache-2.0
- Decision: **REFERENCE ONLY**

Code evidence: 613 files and focused Python/TypeScript tests for typed human
tasks, terminal idempotency, authorization, Slack/email identity, signed
webhooks, redaction and audit. It is a useful wait/response protocol but a narrow
approval service, so production adoption would conflict with Company OS exact
approval ownership.

