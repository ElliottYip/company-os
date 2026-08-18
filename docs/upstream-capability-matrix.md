# Upstream capability matrix

Audit date: 2026-08-18. Scores are 1 = supported with a production-shaped
implementation, 0.5 = usable but requires a Company OS extension, 0 = absent or
architecturally incompatible. Marketing claims do not count without code/schema/
test evidence.

## Paperclip 70% gate

Pinned source: `v2026.817.0` /
`213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`.

| Generic capability | Score | Code-level finding |
| --- | ---: | --- |
| Company tenancy | 1 | company-scoped tables, middleware and route guards |
| Human auth and membership | 1 | Better Auth, memberships, roles and invitations |
| Agent hierarchy | 0.5 | mature agents, but `reportsTo` is Agent-to-Agent only |
| Task/issue model | 1 | rich issue state, relations, locks and attribution |
| Goals | 1 | hierarchical goals with issue links |
| Projects/workspaces | 1 | independent project and execution workspace models |
| Runs/heartbeats | 1 | durable runs, scheduler, liveness and recovery |
| Runtime adapters | 1 | first-party local/gateway adapters and adapter utilities |
| Plugin SDK | 1 | versioned protocol, capabilities, state, events, jobs and UI slots |
| API/event mechanisms | 1 | REST, live events and plugin event bridge |
| Budgets/costs | 1 | policies, incidents, run cost attribution and hard stops |
| Artifacts/documents | 1 | issue documents, attachments and workspace resources |
| Secret management | 1 | AES-GCM local provider, external provider, versions and access events |
| Approvals | 0.5 | generic approval payload; no required exact Company OS digest binding |
| Audit/responsibility | 0.5 | responsible user is propagated, but no full responsibility contract |
| Idempotency/concurrency | 1 | keys, fingerprints, row locks, leases and compare-and-clear |
| Failure recovery | 1 | process-loss retry, durable waits, liveness and bounded recovery |
| Migration/backup/rollback | 0.5 | extensive migration and backup tooling; data rollback needs rehearsal |
| Local/cloud deployment | 0.5 | local trusted and authenticated modes; Company OS profiles remain external |
| Tests/release gates | 1 | large focused suite, migration/security/release/smoke gates |
| **Total** | **17.5/20 (87.5%)** | **Adoption threshold passed** |

Functional coverage does not override the separate security and upgrade gates.

## Candidate decisions

| Candidate | Pinned tag / full SHA | Decision | Rationale |
| --- | --- | --- | --- |
| Paperclip | `v2026.817.0` / `213dabab4f8e1f3bb1803a2924c0fea1289fcd4c` | **ADOPT** | Single generic work substrate; production gated |
| SapienX AgentOS | `agentos-v0.7.6` / `910e848229139d9e7bf8b585cc70b99b1699ab97` | **REFERENCE ONLY** | useful onboarding patterns, but control plane directly imports OpenClaw domains |
| OpenWorker | no tag / `91a2419654a4bb8f7479a7b56693984330625e47` | **REJECT** | no repository LICENSE at pin, three test files, one-shot schema and immature recovery/migrations |
| Operant | `v0.6.0` / `ac7f7b7ce3bd1d4d881fa104466c193f5eceece2` | **REFERENCE ONLY** | strong per-human principal/OAuth/audit ideas, but Slack/Teams/OpenClaw-shaped owner model overlaps Paperclip |
| Preloop | `v0.14.0` / `346112533b1430abef950cb6344eed1eda70a60f` | **REFERENCE ONLY** | broad gateway/policy implementation, but adopting it would create a second approval/model/data control plane |
| AgentGate | `v0.15.0` / `b1e541a0bda1f6c6b3e94a209578d631a8c0f9c3` | **REFERENCE ONLY** | focused approval SDK patterns; duplicate approval/audit owner |
| JamJet | HEAD pin / `6a484a646132a18645746e8ca3838368dc90cfc3` | **REFERENCE ONLY** | excellent fencing, event replay and receipt tests; adopting runtime would duplicate Paperclip execution |
| Agent Room | `v0.1.0` / `9faaae7f1bef15e25648560f27ac25eea3383b42` | **REFERENCE ONLY** | strong outbox/append-only/security patterns; early control plane and overlapping event store |
| HumanLayer ACP | `v0.5.1` / `bc703d36579edb973da1ca2a748381cdb4eb8b55` | **REJECT** | stale Kubernetes CRD control plane coupled to ContactChannel approval semantics |
| awaithumans | `v0.1.11` / `05b73dbf8c9df7e79c3c585a95a897b0aeb775b1` | **REFERENCE ONLY** | good typed wait/idempotency/channel tests; too narrow and would duplicate approval ownership |

`REFERENCE ONLY` means no source or runtime dependency. A cited pattern must be
re-expressed behind an existing Company OS port and must not import the upstream
domain model.

