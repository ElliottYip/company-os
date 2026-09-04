# Multi-tenant SaaS completion audit

Status: **INVITATION-GATED PRODUCTION RELEASE LIVE — real second-company acceptance pending**
Audited: 2026-09-03

This audit treats the approved specification and live production state as the
authority. Passing local tests is not accepted as proof of the real second-
company journey.

| Requirement | Authoritative evidence | State |
| --- | --- | --- |
| Existing home remains unchanged | Production Web index SHA-256 `b291c99b6b1ccba39ef27ec01d1907345320206b1ae1efd59ddbf1c2581f696e`; real browser opens the authenticated legacy company | Proven |
| Shared domain without customer DNS | `/start` and `/t/<slug>` production routes; invitation-aware Web image `sha256:1cb132abd9a4bf44825379f38fe5823e621ab772c4ff4c92ef13dcb4e8a28c5c` | Live |
| Additive tenant schema | Migrations 0008 and 0009 applied; production starts with zero tenant and invitation-redemption rows | Proven |
| Tenant App Secret encryption | AES-256-GCM envelope tests, tamper tests, secret scan, and root-only production master key | Proven |
| One-use signup invitations | 20 high-entropy codes; runtime stores only HMAC-SHA-256 allowlist and atomic redemption rows; valid-code/dummy-App and invalid-code production probes left zero rows | Proven in production |
| Existing tenant cannot register again | Legacy tenant digest reservation test and production API `sha256:fa45a35de445e4e58397cd8048127b91fbf4ff2761df9fcc6b8c448fcee75359` | Proven with invitation-gated feature enabled |
| First Owner is same-tenant identity | Atomic PostgreSQL completion tests, provider-specific callback and tenant-digest checks | Proven locally; real second tenant pending |
| Invited member has tenant identity mapping | Real PostgreSQL transaction writes membership and binding-scoped external identity atomically; mismatched Feishu provider is rejected before membership | Deployed in production API `sha256:fa45a35de445e4e58397cd8048127b91fbf4ff2761df9fcc6b8c448fcee75359` |
| Cross-tenant data and permission denial | Membership-derived route authorization, two-tenant/callback-swap tests, real PostgreSQL provider mismatch test | Proven in automated tests; bidirectional production canary pending |
| Existing Zhejiang Leike remains intact | Real browser authenticated session; control totals 1 company, 1 owner membership, 8 grants; read-only Feishu snapshot is tenant-matched with 14 active departments and 27 active humans | Proven after current production API rollout |
| Rollback | Prior images and Compose plus database dump in `/srv/company-os/feishu-production/rollback/20260903T070000Z-tenant-invite-gate` | Proven |
| Real second-company end-to-end acceptance | Second company credential proof, same-tenant first login, Owner creation, organization setup, second-user invite/acceptance, bidirectional denial | Missing |

## Remaining acceptance sequence

1. Obtain an App ID and App Secret owned by a Feishu tenant other than Zhejiang
   Leike. The existing `Jake` app is not a valid success canary because it is
   owned by the already-reserved legacy tenant.
2. Allocate one of the operator-held invitation codes and complete the two-user
   real browser journey, recording database, audit,
   ciphertext, callback, and bidirectional denial evidence.
3. Re-run the Zhejiang Leike browser, control-total, directory, health, and log
   checks. Keep unrestricted public signup disabled.

The strict original goal must not be marked complete before steps 2 and 3 pass.
