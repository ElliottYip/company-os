# Preloop upstream record

- URL: https://github.com/preloop/preloop
- Audit pin: tag `v0.14.0`, commit `346112533b1430abef950cb6344eed1eda70a60f`
- License: Apache-2.0
- Decision: **REFERENCE ONLY**

Code evidence: 1,560 files and 165 test/spec paths across Python backend, Go CLI,
Web app and runtime plugins. Models and tests cover organizations, users, model
gateway usage, tools, approvals, budgets, OAuth, WebAuthn, secret scrubbing and
runtime sessions. It is a broad independent governance plane, not a thin SDK;
adopting it beside Paperclip would duplicate model, approval, identity and data
owners. Use policy and egress test cases as requirements only.

