# ADR 0052: Overlay AI assets, evidence-bound evaluations, and verifiable value

Status: accepted  
Date: 2026-09-05

## Context

Company OS already owns distinct Agent, model-routing, data-authorization, tool-access, Work, planning, and cost contracts. The Alpha needs a unified AI inventory without moving those domain rules into a generic asset table. It also needs evaluation and value views that cannot turn estimates or missing prices into apparently verified performance or ROI.

## Decision

`AiAssetGraph` is an overlay projection. It identifies Agent, Model, Prompt, Dataset, Tool, MCP Server, Workflow, and Knowledge Base records, relates them through evidence references, and links them to goals and projects. Existing domain aggregates remain authoritative for execution, permission, data, lifecycle, and billing decisions.

Bounded runtime traces may automatically discover assets. A known executing Agent is projected as governed and keeps its accountable human; newly observed resources start `UNMANAGED` and open a Shadow AI review. Admission requires an assigned human. Duplicate detection opens a revisioned review from explicit source references; merging retires aliases and points them to the canonical asset without deleting historical records.

Evaluation results are admitted only against an active template. Every result freezes evaluator reference, evaluator version, threshold, dataset or Trace provenance, and evidence references. Trends compare results for the same asset and template and apply the template's recorded regression tolerance.

Value measurements retain source reference, digest, method, period, and `VERIFIED` or `ESTIMATED` confidence. Product summaries exclude estimates from verified totals. Net value is unavailable when outcome value is absent, any applicable cost is unpriced, or the selected asset scope cannot be joined exactly to canonical cost evidence.

## Consequences

- One inventory can explain impact across assets, goals, projects, runs, evaluations, risks, and cost while inward domain authority remains separated.
- Trace discovery never imports prompts, outputs, credentials, private sessions, or enterprise record bodies.
- Shadow AI and duplicate handling are review workflows, not silent automatic deletion or invented control.
- “No verified result” and “unpriced cost” are first-class product states.
- API and Web admission, browser journeys, current-run real Connector evidence, and release acceptance are separate gates; local Connector acceptance never implies customer staging or production acceptance.
