# Dashboard professional-console refinement

Date: 2026-08-31  
Scope: Demo Dashboard and shared action-button shape  
Boundary: visual composition only; no product model, authority, approval, evidence, credential, Demo/formal, Runtime or deployment behavior changed

## Evidence and source decision

- Generator runtime source: `/Users/elliottye/Gnerator/src/components/ui/button-1.tsx` defaults medium actions to the square variant with a 6px radius. This current component is authoritative over stale pill wording in Generator's `DESIGN.md`.
- Paperclip reference: the valid local agent-dashboard capture and extraction notes use compact status, metric, distribution/recent-task and cost regions. They do not use Company OS's former oversized attention card plus tutorial path.
- Transfer rule: adopt operational density and scan hierarchy only. Keep Company OS terminology, information architecture and Demo safety labels.

## Closed gaps

| ID | Severity | Before | Remediation | Result |
| --- | --- | --- | --- | --- |
| DPR-001 | P1 | Shared actions and semantic angle badges used conflicting pill geometry. | Added 6px square-rounded actions and a 4px `--family-radius-badge`; status, Demo, safety, counter and enum labels now share the sharp tag system. | Closed |
| DPR-002 | P1 | Dashboard opened with a large generic situation card and tutorial column. | Replaced both with a compact control-plane snapshot toolbar. | Closed |
| DPR-003 | P1 | Dashboard did not expose enough analysis structure for operators. | Added five snapshot-derived KPIs, management-depth distribution, operational-signal queue and recent-work table. | Closed |
| DPR-004 | P1 | 1024px collapsed the two analysis regions vertically, hiding the signal queue below the first viewport. | Retained a measured 400px/304px two-column analysis layout at 1024px; collapse begins below 960px. | Closed |
| DPR-005 | P1 | A monospace metadata container could leak its family into nested action labels. | Added a locale-aware `--family-font-ui` and pinned shared buttons to it. | Closed |

P0 remaining: **0**.  
P1 remaining in this refinement scope: **0**.

## Data integrity

Every displayed value is derived from the existing deterministic snapshot:

- Agent totals and authority distribution: `snapshot.agents`.
- Open signals: governed approval phase, credential alerts and recorded renewal requests.
- Cost: current work, governed record and commercial usage.
- Evidence: current work plus governed evidence references.
- Work table: unmodified `snapshot.work` records.
- Snapshot identity: `generation`, `revision`, `provenance` and `createdAt`.

No trend line, rate, forecast or historical comparison was invented because the fixture does not contain a time series.

## Browser evidence

Before:

- `output/dashboard-pro-refinement-2026-08-31/before/01-dashboard-zh-1440.png`

After:

- `output/dashboard-pro-refinement-2026-08-31/after/01-dashboard-zh-1440.png`
- `output/dashboard-pro-refinement-2026-08-31/after/02-dashboard-zh-1024.png`
- `output/dashboard-pro-refinement-2026-08-31/after/03-dashboard-en-1440.png`
- `output/dashboard-pro-refinement-2026-08-31/after/04-dashboard-en-1024.png`

Measured in the user-selected browser:

- shared action radius: 6px;
- 1440 content width: 1136px;
- 1024 analysis columns: approximately 400px / 304px;
- document horizontal overflow: 0px at 1440 and 1024;
- Agent inventory, approval queue, signal rows and Work navigation remain real buttons with existing in-app navigation behavior.

## Verification

- `node --test --experimental-strip-types tests/web-typography.test.ts tests/web-dashboard-presentation.test.ts`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run test:e2e -- tests/e2e/ui-consistency.spec.ts`: 12 passed across en/zh-CN and 1440/1024/768/320 viewport contracts.
- `npm run verify`: passed end to end; 735 Node tests (731 passed, 4 environment-gated skips), all boundary/security/build gates, and 33 browser cases (29 passed, 4 environment-gated skips).
