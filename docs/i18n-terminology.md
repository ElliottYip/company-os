# Company OS future locale boundary

Localization is not part of the current Paperclip adoption goal. The customer
Web is owned by Company OS, Paperclip page copy is not imported or translated,
and existing Chinese Demo copy is only a seeded product asset. A future active
goal will retain English and add switchable Chinese with its own plan, tests,
and delivery gates.

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

Current boundary rules:

- Demo copy must call every simulated executor “模拟 Agent”.
- Private reasoning, credentials and vendor sessions are never localization
  inputs.
- Functional tests must use stable roles, test IDs, codes, and structured state
  rather than depend on exact English or Chinese prose.
- Domain persistence stores stable codes/parameters and original content, not
  language-specific display sentences.
- User input, Agent output, evidence, and logs retain their source text.
- Missing-key fallback and bilingual coverage become requirements only when the
  separate localization goal starts.
