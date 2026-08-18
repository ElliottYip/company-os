# Agent Room upstream record

- URL: https://github.com/msitarzewski/agent-room
- Audit pin: tag `v0.1.0`, commit `9faaae7f1bef15e25648560f27ac25eea3383b42`
- License: Apache-2.0 with NOTICE; both must be retained if incorporated
- Decision: **REFERENCE ONLY**

Code evidence: 207 files and 33 test/spec paths. Its foundation migration has
append-only event/audit triggers, source-event uniqueness, command fingerprints,
event/run-control outboxes, hashed tokens, CSRF sessions and explicit down SQL.
Security tests cover approval atomicity, session boundaries, artifact restore and
release provenance. It is early and overlaps Paperclip's event/control plane;
use its invariants, not its implementation.

