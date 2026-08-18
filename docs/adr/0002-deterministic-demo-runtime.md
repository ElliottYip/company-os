# ADR 0002: Deterministic isolated Demo Mode

Status: Accepted  
Date: 2026-08-18

## Decision

Demo Mode is event-driven with a deterministic clock, IDs, fixtures, and reset.
Its task/approval/evidence/responsibility flow uses production domain and
application contracts but cannot access network, models, relay, MCP, shell,
filesystem, enterprise systems, credentials, or production data.

Production promotion copies a sanitized organization template only and forces
identity, agent, permission, and responsibility rebinding.

## Consequences

- Demo is repeatable product behavior rather than a static tour.
- Every demo record carries fixture provenance and the UI labels the mode.
- Production identity gates cannot be bypassed by demo state.

