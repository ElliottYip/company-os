# 01 — Onboarding and first company

## Evidence

- Paperclip source checkout: `work/upstream-audit/paperclip`
- UI package version: `0.3.1`
- repository revision inspected: `213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`
  (`v2026.817.0`)
- actual local product route: `http://127.0.0.1:3100/onboarding`
- capture viewport: 1440 × 900
- screenshots:
  - `docs/audits/2026-08-24-paperclip-ui-extraction/01-onboarding-company-name.png`
  - `docs/audits/2026-08-24-paperclip-ui-extraction/02-onboarding-mission.png`

The browser was stopped before `Confirm mission`; no Company, Goal, Agent,
Project or Issue was created. The existing local instance was read-only during
the capture.

## Source and state ownership

| Concern | Paperclip source |
|---|---|
| Full-screen wizard and steps | `ui/src/components/OnboardingWizard.tsx` |
| Initial create-vs-grow choice | `ui/src/components/FrontDoor.tsx` |
| Route ownership and dismissal | `ui/src/lib/onboarding-route.ts`, `ui/src/context/DialogContext.tsx` |
| Empty-company auto launch | `ui/src/components/Layout.tsx` |
| Company/goal/project/task seed | `ui/src/lib/onboarding-launch.ts` |
| Dashboard recovery entry | `ui/src/pages/Dashboard.tsx` |

Paperclip owns six UI states: front door (`0`), company name (`1`), mission or
existing-team questionnaire (`2`), lead Agent name (`3`), adapter/model and
environment test (`4`), and review/launch (`5`). The wizard persists its draft
to local storage and permits navigation back to completed segments.

Its lifecycle is not one atomic submit. Confirming mission creates Company and
company Goal; the model step hires and, when needed, approves the first Agent;
launch creates or reuses an onboarding Project and creates the first Issue.
Errors remain inside the wizard. Adapter environment failure blocks Agent
creation, while instructions-file seeding is explicitly non-fatal.

## What it solves well

- One visible path from an empty installation to the first assigned task.
- Progressive disclosure: identity and mission before runtime configuration.
- Resume and back navigation protect users from losing a long setup.
- Environment tests happen before claiming that an Agent is online.
- Review makes the created objects legible before entering the dashboard.
- Dashboard has recovery paths for both “no company” and “company with no
  Agent”, rather than leaving a dead empty state.

## Company OS conflicts

- Paperclip calls the first Agent a CEO/team lead. Company OS requires an
  accountable human before an Agent; an Agent cannot inherit legal or
  organizational responsibility.
- Paperclip makes adapter/model connection part of the first-run success path.
  Company OS Demo must work without credentials, model, Relay, tool, shell or
  enterprise system access.
- Paperclip creates durable objects partway through the wizard. Company OS
  should either keep a local draft until review or use an idempotent setup
  transaction with an explicit recovery receipt.
- A successful environment test is runtime readiness, not proof of identity,
  permission, data authorization or responsibility coverage.

## Accepted Company OS mapping

Company OS will keep a non-blocking “enter Demo now” path. Choosing “configure
my company” opens a resumable full-screen flow:

1. company name and purpose;
2. first department and mandate;
3. accountable human and role;
4. first Demo Agent, reporting human and autonomy level;
5. review, explicit Demo label and local apply.

Model/Connector binding is a later formal-mode step and cannot block the Demo.
The final review creates one validated `OrganizationDraft`; it does not create
real credentials or imply that the fixture Agent is live. Promotion to formal
mode copies only a sanitized organization template and requires fresh identity,
Connector, permission and responsibility binding.

Decision: **extract interaction pattern; do not copy page code or lifecycle**.
