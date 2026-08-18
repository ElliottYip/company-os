# JamJet upstream record

- URL: https://github.com/jamjet-labs/jamjet
- Audit pin: no single stable repo tag selected; commit `6a484a646132a18645746e8ca3838368dc90cfc3`
- License: Apache-2.0
- Decision: **REFERENCE ONLY**

Code evidence: 985 files, 122 test/spec paths and 10 SQL migrations. Rust runtime
tests cover tenant isolation, leases/fencing, idempotency, atomic event commits,
fresh-process/cross-backend resume, projected approvals and tamper-evident audit.
These are high-quality characterization patterns. Adopting the runtime would
duplicate Paperclip execution ownership; translate the invariants into bridge
contract tests instead.

