# Paperclip UI extraction: tasks and work timeline

Status: rendered-page and source/API extraction complete; Company OS adaptation in progress.

## Evidence pin

- Upstream checkout: `213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`
- Upstream tag: `v2026.817.0`
- License: MIT (reference only; no page code is copied)

Valid rendered captures:

- `docs/audits/2026-08-24-paperclip-ui-extraction/08-task-list.png`
- `docs/audits/2026-08-24-paperclip-ui-extraction/09-work-timeline.png`
- `docs/audits/2026-08-24-paperclip-ui-extraction/10-task-detail.png`
- `docs/audits/2026-08-20-paperclip-page-atlas/reference/desktop-timeline.png`

## Route and source map

| Page | Route | Primary source | Supporting source / API |
|---|---|---|---|
| Task list | `/issues` under the selected company | `ui/src/pages/Issues.tsx`, `ui/src/components/IssuesList.tsx` | `ui/src/api/issues.ts`, filter/group/sort helpers, `KanbanBoard.tsx` |
| New Task | global dialog opened from the rail or list | `ui/src/components/NewIssueDialog.tsx` | issue API, Agent/project/workspace APIs, draft and recent-selection helpers |
| Task detail | `/issues/:issueId` | `ui/src/pages/IssueDetail.tsx` | properties, chat, activity, run ledger, documents, attachments, related-work components |
| Work timeline | `/timeline` | `ui/src/pages/Timeline.tsx`, `ui/src/components/timeline/WorkTimelineChart.tsx` | `ui/src/api/workTimeline.ts` |

## Page functionality

### Task list

- New Task entry and URL-backed debounced search.
- Dense list or board view.
- Filter, sort, visible-column and group controls.
- Grouping by status, priority, assignee, project, workspace or parent.
- Date separators for recency sorts, nested parent/sub-task rows and incremental loading.
- Supports direct assignee changes and preserves view preferences per scope.
- Server filters include blocked attention, status, project, parent, Agent/human participant, label, workspace, origin, descendants and text search.

### New Task

- Fast title-first entry with optional rich description.
- Assignee may be a human or Agent.
- Project, project workspace, execution workspace, parent task and priority context.
- Agent-specific model/profile/thinking overrides are capability-gated.
- Draft persistence and restoration.
- Attachment/image upload and task document creation.
- Creation defaults follow the current list group or parent task.
- Workspace isolation/reuse is explicit when enabled.

### Task detail

- Title and rich description with project, origin and status context.
- Properties pane: status, labels, assignee, project, parent, blockers, blocking tasks, sub-tasks, reviewers, approvers, monitor and timestamps.
- Chat, Activity and Related work views.
- Human/Agent comments, system notices and interaction cards.
- Run lifecycle, live execution, interrupt/cancel, retry/recovery and no-live-path states.
- Documents, attachments, work products and deep links.
- Task-tree pause/resume/cancel holds and recovery controls.
- Plan decomposition, suggested sub-tasks, confirmation/questions and tool-action decisions.
- Optimistic comments and run updates with rollback/error handling.
- Cost, token and runtime summaries in the activity projection.

### Work timeline

- Company-wide Agent lanes and execution spans.
- Distinguishes delegated, automated and cancelled work.
- Summary metrics for runs, Agents, runtime and token usage.
- Today, seven-day, thirty-day and custom ranges.
- Zoom in/out/reset and clipped-window accounting.
- Human activity can be projected onto the same temporal view.

## Important engineering patterns

- List/query state is encoded in stable structured filters, not page copy.
- Detail data is split into task, comments, activity, runs, attachments and documents so each can poll/cache independently.
- Optimistic updates retain rollback data.
- Runtime uncertainty, retry, recovery and blocked chains are modeled explicitly.
- Parent/child and blocker relationships are distinct.
- A task's display thread joins human conversation and execution events, but the underlying records remain typed.

## Company OS product conflicts

- A generic assignee is insufficient: executable work must bind goal initiator, accountable human, executing Agent, responsibility contract, permissions and data authorizations.
- A comment-thread approval cannot replace the exact high-risk action/digest approval contract.
- Agent/model overrides belong to runtime policy and Connector boundaries, not the neutral work domain.
- Raw vendor sessions, private reasoning and credentials must never appear in task state or evidence.
- Demo task creation cannot upload, execute, browse files or call an external model.
- Task status alone cannot represent the full responsibility/evidence/result lifecycle.

## Accepted Company OS mapping

| Paperclip interaction problem | Company OS implementation |
|---|---|
| Quick task capture | Compact New Task dialog with outcome/acceptance goal and executing Agent |
| Dense operational scan | Agent Boss inbox grouped by active, approval-required, blocked and completed work |
| Rich task detail | One responsibility work record with Overview, Activity, Evidence and Responsibility projections |
| Execution thread | Typed plan/progress/tool/evidence events rendered chronologically; comments stay distinct from evidence |
| Properties side panel | accountable human, Agent, department, risk, permissions, data contracts, approval and result facts |
| Runtime recovery | paused, cancelled, timeout and outcome-unknown states with evidence-backed reconciliation |
| Company timeline | responsibility-aware timeline that can answer who initiated, executed and approved each span |

## What is not copied

- Paperclip issue/page components, page layout, icons, wording, shared types and API client.
- Paperclip task identifiers or database schema.
- Vendor model/session controls inside Company OS core work records.
- Chat messages presented as audit evidence without an evidence admission step.
