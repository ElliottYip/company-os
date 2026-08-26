# 来源、知识与取材边界

AgentBoss School 0.7 的知识不是文章列表，而是三层可审计结构：

1. `research/source-registry.json`：来源、等级、状态、适用节点和限制；
2. `research/claim-map.json`：课程实际使用的最小主张、冲突和项目口径；
3. lesson：把已解决主张转成决定框架、失败模式、练习和完成证据。

课程框架见 `references/curriculum-framework.md`，GitHub 项目与许可证审查见 `references/open-source-research.md`。

## 当前知识覆盖

| 领域 | 已纳入的核心知识 |
|---|---|
| 角色与委派 | 能力/授权/责任、四种工作模式、结果合同、控制边界拆分、上下文合同、工作流/单 Agent/多 Agent 选择 |
| 运营与可靠性 | 生命周期状态、环境 ground truth、可行动观测、trace 与结果分离、重复 trial、grader 组合、结果未知与幂等恢复 |
| 治理与安全 | 最小功能/权限/自治、技术身份与业务授权分离、精确动作审批、提示注入、工具副作用、持续风险治理 |
| 团队采用 | 本地基线、试点评测门、组织强弱放大假设、一线参与、运营复盘与退出/移交 |
| RAG | 外部记忆与出处、检索/内容/生成分别验证、授权案例输入、确定性索引 |
| 认证 | Ed25519 项目签名凭证、自愿 Yearbook、非学历边界、与 W3C VC/Open Badges 的明确不符合声明 |

## 主要权威来源族

- 治理：NIST AI RMF 1.0、NIST GenAI Profile、OWASP Agentic Security、MCP Authorization；
- 人因：CHI Human-AI Interaction Guidelines、Parasuraman 等自动化层级、Bainbridge 自动化悖论；
- 可靠性：AWS 幂等 API、Google SRE 监控和事故管理；
- 评测：Anthropic Agent Evals、OpenAI Agent Evals、Inspect AI、τ-bench、METR；
- RAG：NeurIPS RAG 原始论文、Contextual Retrieval；
- 组织采用：OECD workplace cases、DORA 2025（仅作软件组织语境下的待验证假设）；
- 凭证互操作：W3C VC 2.0、Open Badges 3.0（只作未来迁移参考）。

精确标题、URL、日期、证据等级和限制以机器 registry 为准，避免本文件复制后漂移。

## Company OS 一手来源

School 在 Company OS 仓库内时，可核对产品宪法、责任合同、工作模型、精确审批、确定性 Demo 与正式 API。它们支持 **AgentBoss 项目政策与产品行为**，不冒充外部行业共识。独立安装读不到这些文件时，使用 lesson 中的蒸馏知识并说明未核对原文。

## GitHub 与版权规则

- 高星只用于发现候选，不支持效果、可靠性或安全主张；
- 先核对官方仓库、维护状态、代码/文档/目录级许可证；
- 默认只做独立概括，不复制正文、图、截图、品牌视觉、数据集或代码；
- 当前 `research/open-source-projects.json` 中所有 `copiedAssets` 均为空；
- 未来复制兼容许可证代码前，必须登记 commit、文件、SPDX、copyright notice、修改和用途；
- source-available 代码不得因“可看源码”被并入 MIT 项目。

## 案例来源

案例的 canonical 声明在 `rag/case-catalog.json`。内置合成案例必须保持 `SYNTHETIC_SCENARIO / ILLUSTRATIVE / UNVERIFIED`；原始真实案例输入不得直接进入 RAG，必须经过授权、匿名化、证据审查和教学蒸馏。正文自述不能替代 catalog 中的 `caseType`、`evidenceQuality` 和逐条结果验证。详见 `references/case-rag.md`。

## 冲突与引用规则

1. 定义冲突选择课程操作定义，同时保留映射；事实冲突无法解决时标 `CONTESTED`。
2. 工程差异改写成选择条件，不投票选“最多来源”。
3. `AGENTBOSS_POLICY` 必须明确标注，不包装成标准或研究结论。
4. Demo、benchmark 和单次成功不能证明生产效果。
5. 不写未经核验的 ROI、效率百分比、客户名称或管理跨度。
6. 原话只做必要短引并标来源；课程以独立转述为主。
7. 新增外部视觉资产前更新 Company OS `docs/source-manifest.md`；当前 School 不含外部视觉资产。
