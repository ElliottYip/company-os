# 00 — Product shell and company pulse

## Evidence

- Paperclip revision: `213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`
  (`v2026.817.0`, MIT).
- Primary source: `ui/src/pages/Dashboard.tsx`.
- Supporting sources: `ui/src/components/Layout.tsx`,
  `ui/src/components/ActiveAgentsPanel.tsx`,
  `ui/src/components/ActivityRow.tsx`, `ui/src/components/MetricCard.tsx`,
  `ui/src/api/dashboard.ts`, and `ui/src/api/activity.ts`.
- Company OS visual source: user-owned Generator revision
  `a66c8996cb6150da3a2da5a5026efe771942583d`; reusable shell and control
  provenance is recorded in `docs/source-manifest.md`.

## Paperclip functionality extracted

The dashboard is a recovery and triage surface, not a decorative landing page.
It loads an aggregate company summary, active Agents, recent issues, recent
activity, project identity and company-member identity. It supplies explicit
empty-company and no-Agent recovery actions, shows budget incidents before
ordinary metrics, and keeps the most recent work and activity reachable from
one screen.

Its UI depends on Paperclip Issue, Project, Agent and budget aggregates. Those
types and page components are not portable Company OS contracts.

## Company OS mapping

Company OS keeps the triage hierarchy but replaces the object model:

1. `Needs your attention` is driven by an exact, paused approval binding.
2. Company pulse starts with accountable humans, Agent colleagues, pending
   human decisions and responsibility evidence.
3. Current work keeps goal, accountable human, executing Agent, activity,
   evidence and result together.
4. Team status names the responsible human before presenting Agent state.
5. The relationship projection and chronological activity remain secondary
   drill-down surfaces rather than competing dashboard widgets.
6. Demo copy explicitly states fixture boundaries; no model, tool, credential
   or production activity is inferred.

The Company OS implementation is in `web/mount.ts` and `web/styles.css`. It
does not import Paperclip source, shared types, API clients, branding or runtime
services.

Decision: **reuse the prioritization pattern; independently implement the page
and Company OS responsibility semantics**.
