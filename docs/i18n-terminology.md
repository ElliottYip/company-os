# Company OS Chinese terminology contract

The customer Web is owned and localized by Company OS. Paperclip page copy is
not imported or translated.

| Message key concept | Required Simplified Chinese | Avoid in customer copy |
| --- | --- | --- |
| `principal.human` | 真人 | 人类用户、真人 Agent |
| `principal.agent` | Agent | 机器人、真实 Agent（Demo 中） |
| `accountability.owner` | 真人负责人 | Agent 负责人（当主体为真人时） |
| `approval.reviewer` | 审批人 | 审核机器人 |
| `responsibility.contract` | 责任合同 | 提示词合同 |
| `evidence.item` | 证据 | 思维链 |
| `work.result` | 结果 | 模型真相 |
| `autonomy.level` | 自主等级 | 智能等级 |
| `demo.fixtureAgent` | 模拟 Agent | 真实 Agent |
| `organization.department` | 部门 | 群组（表达正式部门时） |

Rules:

- Missing Company OS keys may fall back to English copy, never to a raw key.
- Demo copy must call every simulated executor “模拟 Agent”.
- Private reasoning, credentials and vendor sessions are never localization
  inputs.
- A new customer-visible concept must update this table and the i18n guard.

