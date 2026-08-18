# ADR 0003: Replaceable identity and one-codebase profiles

Status: Accepted  
Date: 2026-08-18

## Decision

One business codebase supports `managed-cloud` and `self-hosted` adapter
profiles. Managed cloud defaults to Raft Identity behind `IdentityPort`; local
enterprise may select OIDC/SAML/LDAP adapters. Product token audiences,
permissions, and audits remain separate even when login is unified.

Core/application assumes neither internet availability nor Raft cloud.

## Consequences

- Profile selection changes composition, not business semantics.
- Raft/Nostr stays inside a Raft-specific edge adapter.
- Database schema, configuration, and lifecycle remain Company OS-owned.

