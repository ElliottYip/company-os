# 课程地图：成为 Agent Boss

## 课程结果

学生能够定义真人责任，判断工作适配度，拆分控制边界，写结果与上下文合同，并用证据选择工作流、单 Agent 或多 Agent。

## 可用节点

| 节点 | 主要决定 | lesson |
|---|---|---|
| `role/not-a-prompt-engineer` | 能力、授权和责任如何分开 | `lessons/role/01-not-a-prompt-engineer.md` |
| `role/delegation-fit` | 自动化、辅助、委派还是真人保留 | `lessons/role/02-delegation-fit.md` |
| `role/outcome-contract` | 什么算完成、凭什么验收 | `lessons/role/03-outcome-contract.md` |
| `role/work-decomposition` | 每段工作由规则、Agent 还是真人控制 | `lessons/role/04-work-decomposition.md` |
| `role/context-and-instructions` | 哪些上下文可信、获准、有效且必要 | `lessons/role/05-context-and-instructions.md` |
| `role/orchestration-fit` | 工作流、单 Agent 或多 Agent | `lessons/role/06-orchestration-fit.md` |
| `shared/delegation-clinic` | 把委派、拆分、合同和架构合成一个工作包 | `lessons/shared/05-delegation-clinic.md` |

## 路由

- 把 Agent 当提示词工具或责任主体：从第一课开始。
- 工作整体模糊：先做委派判断与结果合同，再拆分。
- 内容多、冲突多、RAG 不稳：进入上下文课。
- 已决定“一定要多 Agent”：先做架构对比实验，不以 star 或角色数量做决定。
- 需要完整基础认证：走 manifest 的 `defaultPath`，进阶节点不自动加入证书含义。
