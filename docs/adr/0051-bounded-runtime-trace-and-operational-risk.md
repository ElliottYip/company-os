# ADR 0051: Bounded runtime trace and operational risk records

Date: 2026-09-05  
Status: accepted

## Context

Company OS needs enough execution telemetry to explain what an Agent accessed,
detect a policy violation, contain supported execution, and coordinate an AI
Case. Copying arbitrary OpenTelemetry attributes, prompts, tool arguments,
responses, credentials, or private reasoning into the control plane would turn
an accountability feature into a data-exfiltration surface.

## Decision

The inward contract admits a bounded `RuntimeTrace` with at most 256 spans. A
span contains identifiers, kind, display name, timestamps, status, and an
optional resource reference with an explicit authority ID. It has no generic
attribute bag. Raw inputs, outputs, sessions, prompts, credentials, and private
reasoning therefore have no representable field.

Resource-bearing spans produce append-only `AccessMapEdge` records. Explicit
operator-owned risk rules match those edges and produce `PolicyViolation` and
`RiskAlert` records. One assessment event stores the Trace, access edges,
violations, alerts and Cases atomically. High or critical violations enqueue a
pause command in the same durable transaction only when the selected
`AgentExecutionPort` declares `supportsPause`; the initial state is
`PAUSE_REQUESTED`, never an unverified success claim. Unsupported containment
remains visible. The existing Connector outbox redrives the pause and marks it
delivered only after the execution port accepts it. High or critical alerts
open an `AiCase` owned by the Work authority snapshot's accountable human.

AI Cases move through containment, investigation, remediation, review,
recovery, closure, and explicit reopen with optimistic revision checks. Later
HTTP and Web surfaces must call those transitions rather than editing status
fields.

## Consequences

- Company OS can explain subject → resource → operation → authority without
  retaining private execution material.
- Connector capability declarations remain authoritative; the UI cannot claim
  a pause or recovery that the execution plane does not support.
- Rules, projections, case commands, and browser workflows can be added without
  changing the telemetry privacy boundary.
- Rich vendor telemetry may remain in the execution environment and be linked
  by admitted evidence digests, but is not copied inward.
