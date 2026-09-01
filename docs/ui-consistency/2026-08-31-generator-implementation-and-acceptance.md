# Company OS Generator-informed UI implementation and acceptance

Date: 2026-08-31  
Scope: public front door, Demo Dashboard, Agents, Work, Approvals, Governance, Usage & Billing, plus Agent detail, Add Agent, evidence, rejection and credential-renewal flows  
Runtime: isolated local public Demo and local draft only; no credentials, production data, external model, Connector, DNS/TLS, public cutover or formal Runtime mutation

## Outcome

The approved Generator-informed direction is implemented incrementally on top of the existing Company OS shell and product model. The right content lane now inherits the same locale-aware family as the left rail, uses one semantic type scale and presents one focal subject per primary page. Contextual inspection uses right drawers; create/edit and bounded workflows use viewport-centered modals; dangerous rejection uses a smaller safe-focus confirmation modal.

P0 after remediation: **0**.  
P1 after remediation: **0**.

## Gap closure

| Gap | Closure | Evidence |
| --- | --- | --- |
| GEN-001 / GEN-002: rail/content font fracture and unstable weights | One inherited English Inter-first / Chinese PingFang-first stack; 40–48/28–32/24/20/18/15/14/13/12/11 scale; weights limited to 400/500/600. | Computed typography assertions in `tests/e2e/ui-consistency.spec.ts`; static contract in `tests/web-typography.test.ts`. |
| GEN-003 / GEN-005: shallow strips and equal-volume surfaces | Dashboard, Approval, Work, Governance and Usage now use one focal work subject plus subordinate metrics/supporting context. | `output/generator-ui-refinement-2026-08-31/after/`. |
| GEN-004: technical Agent data dominates identity | Agent rows lead with identity, accountable human and operating state; complete runtime/privacy/permission/data boundaries move into the right drawer. | `03`, `04`, `08`, `09`, `12` screenshots in the after directory. |
| GEN-006 / GEN-007: one radius/density for every surface | 4px textual badges, Generator-current 6px action buttons, 8px form controls, 16px panel/overlay and 22px focal roles; only literal dot indicators remain circular. | `web/family-ui.css`, `web/styles.css`. |
| GEN-008 / INT-001 / INT-002: generic or misplaced overlays | 560px right drawers; 576px viewport-centered workflow/create modals; 448px confirmation; shared managed-dialog focus, close, busy and return-focus behavior. | 1024 modal center x=512, 1440 modal center x=720; drawer right-edge delta 0; continuous-resize and static contracts. |
| INT-003 / INT-004: approval/rejection/evidence inconsistency | Dedicated approval workspace, evidence drawer and safe-focus rejection confirmation. | 12/12 UI consistency E2E cases and approval screenshots. |
| Usage renewal mutated on trigger | Request opens a bounded modal, focuses Reason, exposes only a credential reference/status, and writes only on Submit. | `20`, `21`, `24`, `25` screenshots; E2E renewal assertions. |
| 1024 orphan cards | Governance's final supporting card spans the full second row and Usage credential content remains full width. | `23-governance-zh-1024.png`, `24-usage-zh-1024.png`. |

## Implemented contracts

- Visual tokens: `docs/ui-consistency/visual-token-contract.md`.
- Secondary interactions: `docs/ui-consistency/secondary-interaction-contract.md`.
- Source audit and direction: `docs/ui-consistency/2026-08-31-generator-source-audit-and-direction.md`.
- Page/component migration: `docs/ui-consistency/2026-08-31-generator-migration-inventory.md`.

## Browser evidence

Final focused evidence is under `output/generator-ui-refinement-2026-08-31/after/`:

- front door, Dashboard, Agents, Agent drawer and Approval at 1440px;
- Dashboard, Agents, Agent drawer, Add Agent and Approval at 1024px;
- English and Chinese representative states;
- Work, Governance and Usage before/after migration;
- credential-renewal modal at 1440px English and 1024px Chinese.

The follow-up Dashboard density refinement is under `output/dashboard-pro-refinement-2026-08-31/after/`, with Chinese and English captures at both 1440×900 and 1024×768. It replaces the generic attention/tutorial composition with a snapshot-derived operating console and records computed 6px action radii with zero document overflow.

Measured results:

- no horizontal overflow on every inspected page;
- Agent drawer: 560px, fixed to the viewport right edge at 1440 and 1024;
- Add Agent and renewal modal: 576px, centered in the browser viewport (0px center delta), including while open across the 861/860px shell breakpoint;
- creation/renewal initial focus goes to the first meaningful field;
- dangerous rejection initial focus goes to Cancel;
- Escape closes modal/drawer flows and focus returns to the exact trigger in the automated browser suite;
- English and Chinese use identical semantic roles with locale-specific family order.

## Verification record

- `node --test --experimental-strip-types tests/web-typography.test.ts tests/web-secondary-interactions.test.ts`: 15 passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run test:e2e -- tests/e2e/ui-consistency.spec.ts`: 12 passed.
- `npm run test:e2e -- tests/e2e/company-os.spec.ts`: 17 passed.
- `npm run verify`: passed end to end.
  - Node suites: 739 total, 735 passed, 4 existing environment-gated cases skipped.
  - Boundaries, runtime independence, 3D assets/performance, research, protocols, Web interactions and Secret scan: passed.
  - Dependency audit: 0 vulnerabilities.
  - TypeScript and production build: passed.
  - Browser E2E: 33 total, 29 passed, 4 existing live Compose/IdP cases skipped by their environment gates.

## Product and safety boundary

No product model, information architecture, responsibility meaning, approval authority, exact-action binding, evidence admission, Demo/formal separation, credential handling, Runtime, production data, DNS/TLS, network exposure or deployment capability changed. Generator and Paperclip remain external visual references only; no vendor concept was introduced into `core`, `ports` or `application`.
