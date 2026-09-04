# Company OS Codex team onboarding

Status: Feishu identity, production deployment, real login, first-owner setup,
and read-only directory verification completed on 2026-09-03. The production
Web origin is `https://anc.raft.xin`.

## Keep three identities separate

Company OS deliberately separates:

1. **Company member identity** — the human signs in through the configured
   enterprise provider (currently Feishu) and receives a Company OS membership,
   role, department, permission grants, and accountable responsibilities.
2. **Personal Codex identity** — a person may use Codex locally through their
   own ChatGPT workspace sign-in. This identity stays on that person's device
   and is never copied into Company OS or a shared Agent Node.
3. **Company Codex execution identity** — the shared Agent Node uses a dedicated
   automation credential owned by a named workflow or service owner. It is
   stored in Vault or another approved Secret Manager and is redeemed only for
   the exact Work Attempt.

Do not share one employee's `~/.codex/auth.json`, ChatGPT browser session, API
key, or Codex access token with the team. OpenAI documents that cached Codex
authentication contains access material and that managed-workspace membership,
roles, local permissions, and automation credentials are separate controls.

## Choose the company execution credential

Use one of these options for the shared Agent Node:

### ChatGPT Business or Enterprise

Create a dedicated non-human workspace identity or workflow-owned Codex access
token with a finite expiration. Store it in the Secret Broker as
`CODEX_ACCESS_TOKEN`. This keeps execution under ChatGPT workspace governance.
Use a separate token per workflow owner; rotate by installing the replacement,
running the local admission, then revoking the old token.

Official guidance:

- [Codex authentication](https://learn.chatgpt.com/docs/auth)
- [Codex access tokens](https://learn.chatgpt.com/docs/enterprise/access-tokens)
- [Groups and provisioning](https://learn.chatgpt.com/docs/enterprise/groups-and-provisioning)

### OpenAI Platform API

Use a project-scoped service-account API key and store it in the Secret Broker
as `OPENAI_API_KEY`. Billing, retention, and data controls follow the Platform
organization rather than the ChatGPT workspace. Do not use a personal API key
for a shared company runtime.

## Admit the local execution boundary

Each trusted Agent Node host must have the exact pinned Codex CLI version and a
valid local or workload credential. Run:

```bash
npm run test:codex:local
```

The command creates a disposable empty workspace and executes one synthetic
non-production prompt with:

- `--ephemeral`;
- `--ignore-user-config`;
- `--sandbox read-only`;
- approval policy `never`;
- no customer data or side-effecting action;
- retained output limited to outcome, summary, digest, opaque reference, and
  token counts.

The command never prints or persists the Codex login material. A passing local
record proves only the Agent Node execution boundary; it is not customer
staging or production acceptance.

## Add a company member

### Current Feishu flow

The Feishu application remains hosted and managed in Feishu Developer Console;
employees do not upload its configuration and do not install a Company OS
client. The administrator publishes the self-built application to the intended
employee availability range. Each colleague then:

1. opens the Company OS Web origin in a browser;
2. chooses **Open an existing company** and **Continue with Feishu**;
3. signs in with their account in the configured company tenant;
4. accepts a Company OS invitation that was bound to their company email,
   intended role, and department.

Feishu authentication proves who the person is and which tenant they belong to;
it does not itself grant access to a Company OS company. A Company OS Owner or
Admin must still issue or approve the membership. Accounts from another Feishu
tenant are rejected before membership lookup.

The current tenant directory admission reports no enterprise email attributes.
Company OS can still authenticate those users through their stable Feishu
subject and assigns a non-deliverable internal identity alias. For the current
email-bound invitation flow, populate each pilot member's enterprise email in
Feishu before issuing the invitation. Do not send invitations to the internal
`@identity.invalid` alias.

The server-side directory check is read-only and separate from login. It can
read only the contacts included in the Feishu application's 通讯录权限范围 and
returns aggregate verification evidence without printing employee records.
Adding a person to Feishu therefore does not silently create, elevate, suspend,
or delete a Company OS membership.

For each colleague:

1. Provision the person in Feishu and include them in the self-built
   application's availability and directory ranges. For a small pilot, limit
   both ranges to the pilot departments; use all employees only when a complete
   company rollout has been approved.
2. Ensure the person has a ChatGPT seat only if they need personal Codex Local.
   Company OS access and ChatGPT/Codex seats are separate decisions.
3. In Company OS, an Owner creates an invitation bound to the person's verified
   email, intended role, and department. Open **组织**, choose **添加真人成员**,
   enter those fields, and copy the resulting one-time invitation link.
4. The person signs in through Feishu and accepts the one-time invitation.
   Company OS creates the membership and grants atomically; never create a
   shared user.
5. Assign the least-privilege Company OS role:
   - `viewer` for read-only oversight;
   - `operator` for ordinary Work operations;
   - `admin` for company configuration and membership operations;
   - `owner` only for accountable ownership and protected lifecycle actions.
6. Add explicit permission grants and responsibility contracts. Being present
   in the IdP or ChatGPT workspace does not automatically grant Company OS
   permissions, Connector access, data authority, or approval authority.
7. Verify one negative case: the new member must be denied an action outside
   their role or company before the onboarding is accepted.

### Current production evidence

The 2026-09-03 production admission completed a real Feishu authorization-code
login with S256 PKCE and created one verified Feishu account, one active
session, one instance administrator, one company, one Owner membership, and one
registered organization. The separate read-only directory verifier matched the
configured tenant and returned 14 active departments and 27 active humans. It
returned no raw personal data or secret material. All 27 directory records
currently lack an enterprise email, so populate that field for each pilot user
before creating the email-bound invitation described above.

## Register the shared Codex runtime

An Owner or authorized administrator completes these steps once per company
environment:

1. Deploy the immutable Codex Agent Node on a trusted private execution host.
2. Register its installed runtime and verify its health through the formal
   Connector boundary.
3. Create the Broker-owned Secret reference for `CODEX_ACCESS_TOKEN` or
   `OPENAI_API_KEY`; Company OS stores only the opaque reference and version.
4. Register and enable the model provider route only after provider capability,
   residency, classification, Secret status, and Broker health all match.
5. Create the governed Agent, assign one accountable human and a backup human,
   activate its responsibility contract, and configure a bounded budget.
6. Dispatch one synthetic Work, verify ordered progress, usage ingestion,
   evidence/result digest, terminal lease revocation, and idempotent replay.
7. Repeat after an API restart and a credential rotation before admitting the
   environment for customer staging.

## Joiner, mover, and leaver controls

- **Joiner:** verify IdP membership, Company OS invitation, least privilege,
  responsibility scope, and one denial test.
- **Mover:** update the authoritative IdP group, Company OS department/role,
  permission grants, and responsibility contracts as separate changes.
- **Leaver:** remove access at the authoritative IdP/SCIM source, suspend the
  Company OS membership, transfer accountable responsibilities first, revoke
  personal automation tokens, and rotate any workflow credential the person
  could access.

No personnel change should silently change the shared Codex Agent's execution
identity, model route, budget, or data authorization.
