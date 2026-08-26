# 合成教学案例库

这些案例用现实中常见的角色、系统边界、异常和治理约束构造，但所有组织、事件、数据、数字与结果都是虚构的。它们用于让学生作决定，不用于证明效果。

| 案例 | 主要决定 | 优先课程节点 |
|---|---|---|
| [付款接口超时](case-synthetic-invoice-timeout.md) | 重试、查询、对账还是新请求 | `operations/retry-and-outcome-unknown` |
| [研究网页提示注入](case-synthetic-research-injection.md) | 怎样让不可信内容拿不到秘密和工具权 | `governance/prompt-injection-and-tool-risk` |
| [五个客服 Agent](case-synthetic-multi-agent-support.md) | 工作流、单 Agent 还是多 Agent | `role/orchestration-fit` |
| [招聘自动拒绝](case-synthetic-candidate-screening.md) | 高影响任务应自动化、辅助还是真人保留 | `role/delegation-fit` |
| [销售周报试点暂停](case-synthetic-sales-pilot.md) | 继续、收紧、扩大还是停止试点 | `team/pilot` |

## 导师使用方式

1. 先讲课程原则，再引入案例；案例不能反过来定义规范。
2. 开场明确说“以下是合成教学案例，不是真实客户案例”。
3. 在关键决策处暂停，让学生先选择并说明证据。
4. 展示推荐处理，同时讨论至少一个反例或边界。
5. 结尾区分可迁移原则与情境特有假设。
6. 不引用虚构数字，不把 `status=VERIFIED` 解释成结果已验证；它只表示编辑审核通过、允许进入索引。

## 可复用问题

- 哪一项信息变化会让你改变决定？
- 最坏的副作用是什么，是否可逆？
- 什么是过程证据，什么是环境结果？
- 哪个真人拥有停止、批准和接受结果的权力？
- 若不能使用 Agent，最小可行的人工或规则路径是什么？

## 添加新合成案例

使用 `_case-template.md`，并满足 `references/case-rag.md` 的强制边界。合成案例不需要伪造授权编号，也不能借用真实公司可识别细节“增加可信度”。现实感来自完整的工作流、约束、异常和取舍，不来自冒充事实。
