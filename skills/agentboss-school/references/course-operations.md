# 课程地图：运营 Agent 工作

## 课程结果

学生能够用状态和证据运行 Agent 工作，设计可行动观测，建立可重复评测，并在副作用结果未知时安全恢复。

## 可用节点

| 节点 | 主要决定 | lesson |
|---|---|---|
| `operations/lifecycle-control-loop` | 状态如何推进、暂停、终止和恢复 | `lessons/operations/01-lifecycle-control-loop.md` |
| `operations/observe` | 观察哪些可行动信号 | `lessons/operations/02-observe.md` |
| `operations/evaluate-and-review` | 能力与上线决定如何取证 | `lessons/operations/03-evaluate-and-review.md` |
| `operations/retry-and-outcome-unknown` | 超时后何时重试、查询或对账 | `lessons/operations/04-retry-and-outcome-unknown.md` |
| `operations/intervene` | 等待、澄清、重试、改派、暂停、取消还是接管 | `lessons/operations/05-intervene.md` |
| `operations/cost-latency-budget` | 质量与风险门内怎样约束全链路成本和尾部延迟 | `lessons/operations/06-cost-latency-budget.md` |
| `shared/demo-responsibility-loop` | 体验基础责任状态机 | `lessons/shared/01-demo-responsibility-loop.md` |
| `shared/outcome-unknown-tabletop` | 在渐进信息中完成安全恢复 | `lessons/shared/02-outcome-unknown-tabletop.md` |
| `shared/evaluation-lab` | 构造可重复的最小上线评测门 | `lessons/shared/04-evaluation-lab.md` |

## 路由

- 只有聊天记录、没有工作状态：从生命周期开始。
- 有 trace 但不知道是否成功：进入观察，再进入评测。
- 用一次 demo 声称可靠：直接进入评测。
- 发布、付款等请求超时：先按结果未知处理，禁止无条件重试。

## 课程边界

运营六个核心节点已经齐备；工具实现与具体数值仍必须按本地环境验证。
