# 开源项目研究与版权边界

高星项目帮助发现成熟实现，但 star 不是质量、可靠性、安全性或许可证兼容性的证据。**Star 只用于发现候选**，不进入证据等级。机器可读审查见 `research/open-source-projects.json`，每次正式课程发布前复核维护状态与许可证。

## 准入规则

1. 先确认官方仓库、活跃/维护/归档状态和发布日期。
2. 分别查看代码、文档、图片、数据集及目录级许可证，不能只看 GitHub 顶部标签。
3. 默认只写独立概括和可迁移模式，不复制正文、图表、截图、品牌视觉或代码。
4. 若未来必须复制 MIT/Apache 等兼容代码，先登记文件、commit、SPDX、copyright notice、修改和用途。
5. CC BY 文档的改写或翻译仍需要 attribution；未知许可证内容不进入仓库。
6. source-available 不等于 OSI 开源，也不等于能并入 MIT 项目。
7. Star 快照只说明调研当日的关注度，不参与证据分级。

## 当前结论

| 项目 | 可借鉴 | 不能推出 |
|---|---|---|
| LangGraph | 状态、interrupt、持久化 | 使用框架就可靠 |
| Microsoft Agent Framework | 分层、workflow、跨供应商模式 | Microsoft API 是课程标准 |
| AutoGen | 多 Agent 历史架构与迁移教训 | 高星代表仍适合新项目 |
| CrewAI | Crew 与 Flow 的控制权差异 | 多 Agent 比单 Agent 强 |
| OpenHands | 长程工具环境与软件 Agent 评测 | 软件任务经验可直接外推所有行业 |
| Langfuse / Phoenix | trace、dataset、experiment | 有 trace 就有业务证据 |
| Inspect AI | task、solver、scorer、sandbox | 通用模型 eval 等于生产治理 |

## 当前复制清单

`copiedAssets` 全为空：课程没有复制上述项目的代码、文档段落、图表、截图或数据。所有内容都是面向 Agent Boss 管理决策的独立中文蒸馏，并通过来源 ID 回链。
