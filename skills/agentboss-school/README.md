# AgentBoss School

AgentBoss School 是一套 MIT 开源、供应商中立的 Agent 管理课程。它训练对 Agent 工作负责的人：判断什么值得委派，定义结果和权限，观察与介入执行，用证据评测结果，并把单次实践变成可持续的团队运营。

它不以某个模型、Agent 框架或付费服务为先修，也不把 prompt 技巧、GitHub star 或 demo 表现包装成生产能力。

## 现在有什么

- 4 门课程、24 个核心知识节点与 6 个 Labs，已全部进入正式课程图谱；
- 46 个经登记来源、24 条带范围与冲突处理的核心声明；
- 8 个 GitHub 项目的维护与版权审查；
- 5 个明确标注的合成教学案例、授权优先的真实案例 RAG 和案例输入模板；
- 一套供 Skill 直接运行的三幕课堂协议、5 条连续案例主线和 21 类学员工作件；
- 三层实践系统与 3 个可重复运行、逐轮信息揭示、双轨评分的故障情境；
- 默认 Foundations 路径、责任闭环 Lab；
- Ed25519 签名的 Agent Boss Foundations Certificate；
- 学员自愿加入、可退出的 Yearbook；
- 免费课程、可选 Agent Boss 陪跑和 FDE 的明确商业边界。

## 四条学习路径

| 路径 | 六个核心决定 | 主要 Lab |
|---|---|---|
| 成为 Agent Boss | 责任、委派适配、结果合同、工作拆分、上下文、编排选择 | 委派设计诊所 |
| 运营 Agent 工作 | 生命周期、观察、介入、评测、结果未知、成本与延迟 | 责任闭环、结果未知、评测 |
| 管好权限与风险 | 权限、数据、提示注入、精确审批、身份与 Secret、事故恢复 | Agent 安全 tabletop |
| 把方法带进团队 | 角色、Skill 流程化、运营复盘、试点、价值、变更移交 | 团队试点 Studio |

这张表只用于导航。具体顺序由课程地图和学员证据决定，不要求机械地从第一项学到第六项；真正教学时只加载当前 lesson。

## 快速开始

需要 Node.js 22.12 或更高版本。仓库没有运行时第三方依赖。

```bash
git clone https://github.com/ElliottYip/agentboss-school.git
cd agentboss-school
npm test
node scripts/install.mjs --target ~/.codex/skills/agentboss-school
```

安装器默认拒绝覆盖已有目录。只有你已经检查差异并准备保留自动备份时，才使用 `--replace`。安装后在支持 Skills 的 Agent 中调用 `$agentboss-school`；也可以直接阅读课程地图和 lesson。

## 架构

```text
SKILL.md 教务路由
  → 课程地图
    → 单节点 lesson
      → claim map
        → source registry

合成案例 → ILLUSTRATIVE/UNVERIFIED 强制标记 ┐
真实案例 → 授权/匿名化/证据审核            ├→ 教学案例 → 确定性 RAG 索引
学习证据 → 发行方审核 → 签名凭证 → 可选 Yearbook
```

- [知识与课程框架](references/curriculum-framework.md)
- [课堂运行协议](references/classroom-runtime.md)
- [实践系统与可运行 Labs](references/practice-system.md)
- [知识厚度审计](references/knowledge-thickness.md)
- [当前知识和来源](references/sources.md)
- [开源项目与版权审查](references/open-source-research.md)
- [案例 RAG 规则](references/case-rag.md)
- [合成教学案例库](references/cases/README.md)
- [案例输入表](references/cases/_case-intake-template.md)
- [认证与 Yearbook](references/certification.md)
- [课程与服务边界](references/service-paths.md)

## 验证

```bash
npm test
node scripts/validate-curriculum.mjs
node scripts/validate-state.mjs /path/to/learner-state.json
node scripts/build-case-index.mjs --check
node scripts/run-practice-lab.mjs --list
node scripts/run-practice-lab.mjs --scenario outcome-unknown --round 1
node scripts/run-practice-lab.mjs --score outcome-unknown --submission practice/submission.example.json
```

维护者在 Company OS 上游工作区中还会运行集成测试；它不属于本独立仓库的使用前提：

```bash
node --test tests/agentboss-school.test.ts
```

## 添加案例

不要把原始客户材料直接放进 RAG。先复制 `references/cases/_case-intake-template.md`，完成授权、隐私、事实和结果声明审核，再由维护者生成教学版案例与 catalog 条目。没有授权或无法匿名化的材料只保留在提供者控制的环境中。

也可以新增明确标注的合成案例。现实感应来自完整工作流、权限、异常和取舍，而不是伪造公司、客户、指标或证据。

## 许可证

AgentBoss School 自有内容使用 [MIT License](LICENSE)。外部标准、论文、文章和项目仍属于各自权利人；仓库只保存独立蒸馏、短必要引用和来源链接。当前没有复制第三方代码、图表、截图、视觉资产或数据集。
