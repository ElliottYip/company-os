# Operant upstream record

- URL: https://github.com/tomascupr/operant
- Audit pin: tag `v0.6.0`, commit `ac7f7b7ce3bd1d4d881fa104466c193f5eceece2`
- License: MIT, copyright Operant contributors
- Decision: **REFERENCE ONLY**

Code evidence: 162 files, 25 test/spec paths and 14 SQL migrations. It implements
per-human Slack/Teams principals, user-scoped integration credentials, RBAC,
approval policies and audit attribution. The schema and server are explicitly
Slack/Teams/OpenClaw shaped, and adopting them would create second identity,
approval and workflow owners. Preserve only the principal-attribution patterns.

