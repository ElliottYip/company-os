# Commercial competitor capability matrix

Status: In progress — initial primary-evidence pass  
Evidence cutoff: 2026-08-18  
Evaluation lens: `docs/product-charter.md` and
`docs/competitive-audit-charter.md`

This is not a final strategy score. `Unknown` means the vendor has not provided
enough public primary evidence; it does not mean the capability is absent.
Marketing claims are recorded as claims, not proof of implementation.

## Market topology

| Product | Current product shape | Primary customer and entry | Deployment / pricing | FDE or implementation |
| --- | --- | --- | --- | --- |
| Workday Agent System of Record | Cross-vendor registry and governance attached to HCM/finance | Workday enterprise CIO/CHRO/CFO; Agent Management Hub and ASOR API | Workday SaaS tenants; Flex Credit/subscription details are contract-dependent | Workday/partner implementation exists; public ASOR-specific FDE model is unknown |
| Microsoft Agent 365 | Cross-vendor observe/govern/secure control plane | Commercial Microsoft 365 admins, security, sponsors and users; Microsoft 365 admin center | SaaS; standalone USD 15/user/month or Microsoft 365 E7 USD 99/user/month | Microsoft experts and ecosystem partners; no disclosed product-embedded FDE contract |
| ServiceNow AI Control Tower | Cross-vendor AI asset/control and value plane over CMDB/workflows | Large enterprises and AI stewards; AI Control Tower workspace | ServiceNow SaaS; contact sales, public standalone list-value promotion is not durable pricing | ServiceNow professional services/partners likely; exact packaged FDE scope unknown |
| Salesforce Agentforce | Builder/runtime embedded in CRM, service and industry clouds | Salesforce customers and admins; Agent Builder and business channels | SaaS; free Foundations, Flex Credits, per-conversation and per-user options | Salesforce/partners provide implementation; public product page does not establish a single FDE operating model |
| Relevance AI Workforce | No-code workforce/team builder and hosted execution | Solo operators through enterprise teams; visual Workforce builder | Hosted SaaS: Free, Pro, Team, Enterprise; action and vendor-credit metering | Enterprise includes dedicated account manager and custom implementation, not a disclosed FDE product |
| Sintra | Prebuilt named helper team with shared context | Founders and SMB operators; Web, desktop, iOS and Android | Hosted subscription; all helpers from USD 97/month, credits | Human support; no public FDE/enterprise transformation offer found |
| Lindy | Personal work assistant plus enterprise Agent Builder/Autopilot | Professionals and enterprise teams; text/iMessage/SMS and Web | Hosted SaaS: USD 49.99/99.99/199.99, enterprise custom | Enterprise onboarding and enablement; no disclosed FDE model |
| Artisan | Vertical AI BDR and outbound platform | Sales, marketing and RevOps teams; managed Web platform | Hosted, sales-led; detailed plan price not established in current evidence | Explicit deployment strategist, FDE and campaign specialist from audit through scale |
| 11x | Vertical outbound and phone digital workers | Enterprise sales/marketing/RevOps; sales-led Web platform | AWS-hosted SaaS; Alice Growth starts USD 3,750/month annual, higher tiers custom | Enterprise explicitly includes four-week white-glove onboarding, CSM and FDE |
| OpenAI Presence | Managed governed Agent deployment for specific production jobs | Eligible high-scale enterprises; account-team entry, no self-service | Limited-GA managed voice/chat deployment; per-customer pricing and terms | Explicitly led by OpenAI FDEs and selected systems integrators |

## Core objects, lifecycle and human responsibility

| Product | Core objects evidenced | Agent lifecycle / governance | Human responsibility finding |
| --- | --- | --- | --- |
| Workday ASOR | Agent definition/registry, provider/platform, identity (ASU), skills, tools, APIs, permissions, activity, audit and ROI | External registration through ASOR API, configuration/activation, skill-scoped security, continuous attestation and audit; retirement details need further evidence | Agent ownership and human/Agent workforce planning are explicit; organizational/legal outcome accountability and a precise action-level responsibility contract are not evidenced |
| Microsoft Agent 365 | Registry record, agent identity, owner/sponsor/manager/user, lifecycle, access package, activity/health/risk, Agent Map | Discovery/sync, registration, lifecycle reviews, access governance, Purview DLP/compliance and Defender runtime protection | Human sponsor/manager and delegated-vs-own access are first-class licensing/governance concepts; exact per-work-result accountable-human/evidence chain remains unproven |
| ServiceNow AI Control Tower | AI asset, agent, model, identity, MCP server, risk/compliance posture, evaluation/value metrics and CMDB/workflow link | Discover/register, classify, monitor, enforce, evaluate and flag elevated/inactive agents; version/decommission evidence remains incomplete | AI stewards govern assets and Build Agent asks who may operate/access; business outcome responsibility and exact approval binding are not public in current evidence |
| Salesforce Agentforce | Agent, job/topic, action, flow/Apex/API, knowledge/Data Cloud context, conversation and metered action | Build, test, deploy to channels, observe plans/actions, meter and optimize; lifecycle depth differs across Salesforce products | Admin/user controls exist, but current evidence does not establish an accountable-human contract for each autonomous action and result |
| Relevance AI | Organization/project, Workforce/team, Agent, Tool, Task/Activity, Action, app trigger, escalation and evaluation | Build/clone, equip, connect, deploy, schedule, observe Activity Center, evaluate and control work hours | Smart escalation is explicit; named accountable human, approval digest and evidence-chain semantics need source-backed validation |
| Sintra | Workspace, named Helper/role, Brain AI context, integration, automation, credit | Prebuilt helper activation, shared context, automation and approval when “it matters”; formal version/decommission/audit lifecycle is not public | Human operator remains implied principal; responsibility, permission contract and auditable approval specificity are weakly evidenced |
| Lindy | Assistant/Agent, inbox/calendar/meeting, workflow/integration, company context, user/team and audit log | Create/train, connect, run, pause on resource limits, evaluate/audit in enterprise; detailed Agent version promotion/rollback remains unclear | Consumer workflow says outbound messages are drafts for user approval; enterprise accountability beyond creator/action logs is not established |
| Artisan | Ava, campaign/sequence, ICP/lead, enrichment signal, mailbox/CRM owner, coaching rule, approval and escalation rule | Audit/design/deploy/scale, progressively move from review to autonomy, monitor campaigns/deliverability | Sends on behalf of named reps and supports staged approval/escalation. This is stronger operational ownership than legal/business accountability and needs action-evidence analysis |
| 11x | Alice/Julian worker, prospect, sequence, managed mailbox/domain, CRM record, call/message and plan/end user | Onboard, configure, run continuously, optimize/review; lifecycle suspension/version/approval evidence incomplete | Outcomes are framed as autonomous workforce delivery. Current evidence lacks precise human approval and accountable-owner semantics for each outbound action |
| OpenAI Presence | Job/workflow, Agent, policy/SOP, scoped permission/knowledge/tool, approved action, simulation/eval/grader, session/action history, escalation, version/rollout | Scope → integrate → legal/security review → simulate/evaluate/accept → staged launch → monitor evidence/escalations → propose/test/approve update → controlled rollout/rollback | Company sets allowed actions, approvals and human takeover; managed deployment has explicit human gates. A portable organization-level responsibility ledger is not described |

## Governance, data and Company OS fit

| Product | Strongest evidenced idea | Conflict or gap relative to Company OS | Current strategic hypothesis |
| --- | --- | --- | --- |
| Workday ASOR | Distinguish non-human identity from authorization; skill-scoped ASU, Agent Gateway and unified human/Agent workforce analytics | Deeply tied to Workday tenant, security domains, HCM/finance data and commercial platform; no self-host/open-source control plane | `REFERENCE ONLY`; best-reference candidacy for enterprise Agent registry/identity is open |
| Microsoft Agent 365 | Owner/sponsor-aware cross-vendor registry plus Entra/Purview/Defender control stack | Microsoft license/identity/data gravity and SaaS-only posture; governance coverage is user-license dependent | `REFERENCE ONLY`; strongest current comparator for enterprise discovery/security integration |
| ServiceNow AI Control Tower | Treat Agents/models/MCP/identities as governed CMDB-linked assets and join risk to business workflow/value | ServiceNow platform lock-in and limited public schema/API details; “asset governance” is not Company OS responsibility-chain semantics | `REFERENCE ONLY`; best-reference candidacy for AI asset inventory/value is open |
| Salesforce Agentforce | Business action metering tied to CRM/Flow/Apex and channel deployment | Vendor/application-cloud coupling and consumption model; not an equal external Agent control plane | `NARROW` hypothesis for CRM-native sales/service use cases, not product foundation |
| Relevance AI | Accessible Workforce/Agent/Tool composition, activity center, work-hour controls and action-based packaging | Cloud/no-code platform owns runtime and data; limited evidence for accountable humans, self-hosting and enterprise data contracts | `NARROW` hypothesis as UX/packaging reference |
| Sintra | Warm named-team onboarding and shared business context for nontechnical SMBs | Weak enterprise identity, permission, audit, data-residency and responsibility evidence; employee-replacement marketing conflicts with accountability thesis | `NARROW` hypothesis for first-run warmth and SMB vocabulary only |
| Lindy | Messaging-native entry and approval-first personal delegation with enterprise identity controls | Personal assistant mental model, hosted execution and broad inbox context differ from company control plane | `NARROW` hypothesis for mobile/delegation entry patterns |
| Artisan | FDE-led audit/design/deploy/scale playbook and progressive trust configuration | Single GTM vertical, hosted vendor worker and send-as-human risks; not multi-vendor/general organization control | `PARTNER`/vertical-reference hypothesis pending deeper workflow evidence |
| 11x | Clearly packaged white-glove/FDE delivery, managed outbound infrastructure and outcome pricing | Strong “worker replaces team” framing, autonomous send/call exposure, proprietary hosted stack and limited responsibility evidence | `NARROW` hypothesis for FDE packaging and vertical template economics |
| OpenAI Presence | Job-scoped least access, simulation/eval acceptance, evidence-led improvement and human-approved controlled rollout | Managed proprietary OpenAI-only deployment, no self-host/open Connector neutrality, pricing/schema unavailable | `PARTNER` or `REFERENCE ONLY` hypothesis; strongest current comparator for FDE production lifecycle |

No product-level hypothesis above is a final `GO/NARROW/PARTNER/STOP` decision.
Those decisions wait for remaining evidence and the single-best-reference matrix.

## Primary evidence register

### Workday

- [ASOR general availability](https://blog.workday.com/en-us/managing-ai-powered-future-of-work.html)
- [Agent Gateway concept](https://doc.workday.com/admin-guide/en-us/workday-ai/agents/agent-system-of-record/agent-gateway/workday-agent-gateway-for-partner-agents.html.html)
- [Register external agents](https://doc.workday.com/admin-guide/en-us/workday-ai/agents/agent-system-of-record/external-agents/register-and-define-your-agent-through-an-api.html)
- [Agent security FAQ](https://doc.workday.com/admin-guide/en-us/workday-ai/agents/agent-system-of-record/agent-security-and-compliance/faq--agent-security.html)
- [ASOR blended-workforce datasheet](https://www.workday.com/content/dam/web/en-us/documents/datasheets/asor-datasheet-enus.pdf)

### Microsoft

- [Agent 365 overview](https://learn.microsoft.com/en-us/microsoft-agent-365/overview)
- [General availability and price](https://www.microsoft.com/en-us/security/blog/2026/05/01/microsoft-agent-365-now-generally-available-expands-capabilities-and-integrations/)
- [Agent 365 licensing FAQ](https://www.microsoft.com/licensing/faqs/122)

### ServiceNow

- [AI Control Tower product](https://www.servicenow.com/uk/products/ai-control-tower.html)
- [Build Agent governance](https://www.servicenow.com/docs/r/application-development/build-agent-governance.html)

### Salesforce

- [Agentforce product](https://www.salesforce.com/agentforce/)
- [Agentforce pricing](https://www.salesforce.com/agentforce/pricing/)

### Relevance AI

- [Workforce product](https://relevanceai.com/workforce)
- [Pricing and plan controls](https://relevanceai.com/docs/get-started/pricing)

### Sintra

- [AI Team](https://sintra.ai/ai-team)
- [Plans and pricing](https://help.sintra.ai/en/articles/9607367-plans-and-pricing)

### Lindy

- [Pricing and enterprise controls](https://docs.lindy.ai/pricing)
- [Lindy Enterprise](https://www.lindy.ai/blog/lindy-enterprise-announcement)

### Artisan

- [Enterprise product and deployment model](https://www.artisan.co/solutions/enterprise)
- [Ava product](https://www.artisan.co/ai-sales-agent)

### 11x

- [Alice pricing and FDE packaging](https://www.11x.ai/products/alice/pricing)
- [Security](https://www.11x.ai/security)
- [Digital-worker product](https://www.11x.ai/)

### OpenAI Presence

- [Product announcement](https://openai.com/index/introducing-openai-presence/)
- [Managed deployment and governance help](https://help.openai.com/en/articles/20001405)

## Evidence still required

- Workday: exact SKU/price, complete deactivate/retire/delete lifecycle, external
  audit export and public schema stability.
- Microsoft: detailed external registry APIs, version/decommission lifecycle,
  exact non-Microsoft Agent coverage and regional/data-residency boundaries.
- ServiceNow: durable pricing, public API/schema/event coverage, approval binding,
  deployment/data-residency and off-platform exit.
- Salesforce: exact lifecycle/version/rollback and evidence semantics across
  Agentforce products, not only builder marketing.
- Relevance AI, Sintra and Lindy: data lifecycle/export/deletion, credential
  isolation, high-risk action binding, mobile permission behavior and regional
  deployment.
- Artisan and 11x: exact approval/evidence records, autonomous send/call rollback,
  identity impersonation boundaries, data retention/export and pricing scope.
- Presence: pricing, customer-owned data/export model, deployment topology,
  Connector neutrality, API/schema portability and exit path.
