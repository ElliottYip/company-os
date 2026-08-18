# SapienX AgentOS upstream record

- URL: https://github.com/SapienXai/AgentOS
- Audit pin: tag `agentos-v0.7.6`, commit `910e848229139d9e7bf8b585cc70b99b1699ab97`
- License: MIT, copyright AgentOS contributors
- Decision: **REFERENCE ONLY**

Code evidence: 656 files and 89 test/spec paths. Setup, health, compatibility and
workspace UX are well exercised, but `lib/agentos/control-plane.ts` and contracts
directly import extensive `lib/openclaw` application/domain types. Scheduled
approval paths state that approval dispatch is not exposed. Reuse onboarding and
Doctor interaction ideas only; do not import its control plane.

