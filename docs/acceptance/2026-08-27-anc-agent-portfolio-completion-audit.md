# ANC Agent Portfolio completion audit

Date: 2026-08-27  
Branch: `codex/anc-agent-portfolio`  
Release candidate: `v0.1.0-rc.7` at `aaee3b5e3016a130148d03ce908503c360c6e4f8`  
Hong Kong state: `HK_CANDIDATE_INSTALLED_NOT_STARTED`

## Audited boundary

This audit covers the multi-layer Agent Portfolio vertical slice, isolated
fixture-only exhibition Demo, immutable RC publication, and Hong Kong Demo
publication preparation. It does not claim a public runtime start, traffic
cutover, formal-mode first start, production readiness, or a real provider
Connector.

## Requirement evidence

| Requirement | Result | Authoritative evidence |
|---|---|---|
| Preserve the existing Company OS core, Web, API, deployment, audit, responsibility, event, OIDC, Secret, backup/restore, and upgrade foundations | Proven | Additive commit history; `npm run check:boundaries`; full repository admission; no retained release directory removed. |
| Establish the corrected ANC product constitution before implementation | Proven | `docs/product-charter.md`, ADR 0046, and `docs/audits/2026-08-27-agent-portfolio-gap-analysis.md` explicitly define retain/extend/migrate boundaries. |
| Represent Personal, Shared, and Federated Runtime Agents with truthful management depth and execution ownership | Proven | `core/agent-portfolio.ts`; `tests/agent-portfolio.test.ts`; invalid visibility/control combinations fail closed. |
| Keep Personal Agent private Work, sessions, files, conversations, and reasoning outside ANC | Proven | Personal Agents require `INVENTORY`, `HUMAN_ENDPOINT`, and `NONE` Work visibility; no Personal Work ingestion route exists; privacy tests pass. |
| Support Observed Shared Work without ANC dispatch | Proven | `application/register-external-work.ts`; idempotent `/portfolio-work/observed` formal route; conflict and private-payload rejection tests pass. |
| Preserve complete Governed Work authority, approval, evidence, result, and responsibility | Proven | Existing responsibility and execution path remains canonical; deterministic Demo reaches the exact high-risk pause and human decision; governed execution regression and E2E gates pass. |
| Synchronize Federated Runtime records without claiming execution ownership | Proven | Monotonic `/portfolio-work/federated` contract, external execution owner validation, bounded source references, and Federated tests pass. |
| Declare Connector data and control capabilities truthfully while retaining v1 compatibility | Proven | `core/connector-capabilities.ts`, Connector SDK v2 records, v1 mapping, and capability-combination tests pass. |
| Manage usage, cost, subscription, seats, quota, credential-reference status, and renewal without Secret material | Proven | `core/agent-commercial-governance.ts`, formal commercial routes, idempotent allocation/renewal tests, and Secret scan pass. |
| Deliver the Portfolio Web information architecture without replacing the retained visual shell | Proven | Bilingual Dashboard, Agents, Work, Approvals, Governance, and Usage & Billing pages; phone/tablet/desktop E2E and navigation gates pass. |
| Provide an isolated, deterministic public Demo Session with reset and recovery | Proven | Server-owned opaque HttpOnly sessions, concurrent visitor isolation, expiry/recover/reset, renewal, approval, origin checks, and formal-route denial all pass. |
| Keep Demo opt-in and formal mode fail closed | Proven | `COMPANY_OS_PUBLIC_DEMO_ENABLED` defaults to false; formal OIDC routes reject Demo identity before handlers; the Hong Kong overlay is explicitly incomplete and non-startable. |
| Verify the complete codebase | Proven | `npm run verify`: 698 tests discovered, 694 passed, 4 conditional external-environment skips, 0 failures; E2E 16 passed and 4 conditional skips; boundaries, typecheck, build, Secret scan, dependency audit, and performance gates passed. Final focused audit: 53/53 passed and Secret scan passed across 1,657 text files. |
| Publish a new immutable RC without overwriting RC4/RC6 | Proven | GitHub release workflow `33054453443`: qualification passed in 7m24s and protected publication passed in 3m09s; release-manifest digest `sha256:311b0a99eba6a355c4a36370c822c0c506edfbdebffddf7d9650e6c2f66494b8`. |
| Prepare the Hong Kong Demo candidate without starting formal mode or touching Hangzhou/DNS/TLS | Proven | RC7 bundle installed as `0.1.0-rc.7-aaee3b5e3016`; release store remains `PREPARED_NOT_STARTED`; RC3/RC4 directories retained; Company OS containers 0; Secret files 0; `staging.env` absent; ingress false; exact remote evidence is in the RC7 candidate JSON. |
| Preflight database compatibility without using production data | Proven | RC6-to-RC7 cutover plan is `PLANNED_NOT_EXECUTED`, PostgreSQL 16, migration history `EXACT_PREFIX`, no added migration, public contracts unchanged, and no database connection or mutation. |

## Release evidence

- Release manifest:
  `sha256:311b0a99eba6a355c4a36370c822c0c506edfbdebffddf7d9650e6c2f66494b8`.
- Secret-free bundle manifest:
  `sha256:cb8574dc1e0379f6c5b946a73bf04685e90c1b3784fed29fdeee36ca4deb116b`.
- Portable staging archive:
  `sha256:670c71c07504b200c5946b69c243cc94b8fb724ef826dac225e05597f8a9e4d9`.
- Target-host candidate record:
  [`2026-08-27-anc-agent-portfolio-hk-rc7-candidate.json`](2026-08-27-anc-agent-portfolio-hk-rc7-candidate.json).
- Target-host non-secret overlay:
  [`2026-08-27-anc-agent-portfolio-hk-rc7-demo-profile.nonsecret.env`](2026-08-27-anc-agent-portfolio-hk-rc7-demo-profile.nonsecret.env).

## Deliberately separate gates

Starting the Hong Kong Demo runtime, running target-host browser acceptance,
opening public traffic, configuring DNS/TLS, initializing formal PostgreSQL,
OIDC or Vault, switching Hangzhou, and accepting a real Slack/OpenAI/QM-like
Connector remain separate authorized operations. Their absence does not weaken
the delivered product vertical slice or Hong Kong publication preparation, and
this audit does not report them as completed.

## Conclusion

The ANC multi-layer Agent Portfolio objective and Hong Kong Demo publication
preparation are complete within the authorized boundary. The implementation is
provider-neutral, fixture-labelled, incrementally integrated, fully verified,
and installed as an immutable prepare-only candidate without weakening the
formal control plane.
