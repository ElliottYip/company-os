# AgentBoss School v0.6 实施记录与维护路线

状态：v0.4–v0.6 三阶段课程图谱完成，进入证据与真实案例维护
日期：2026-08-24
目标：建立一套来源充分、结构一致、可教学、可验证、可独立开源的 Agent 管理课程；免费课程、可选陪跑与 FDE 保持清晰边界。

## 已确认决定

- 主线采用“管理者能力 + 必要技术素养”，不变成 Agent 框架编程课；
- 保留 `role / operations / governance / team` 四门课与 v1 学习状态字段；
- 使用 MIT；外部材料只作独立蒸馏和来源链接；
- GitHub star 只用于发现候选，不进入证据权重；
- 案例 RAG 默认空库，原始案例必须先过授权、匿名化和证据审核；
- 免费课程是完整路径，陪跑和 FDE 只能由真实缺口触发；
- Foundations 认证由发行方审核并签名，Yearbook 单独自愿加入；
- 当前签名 JSON 不声称符合 W3C VC 2.0 或 Open Badges 3.0。

## v0.6 已交付

| 层 | 结果 |
|---|---|
| 课程架构 | 4 门课、24 个核心知识节点与 6 个 Labs，全部进入 manifest |
| 知识研究 | 43 个登记来源、22 条 claim、来源等级和五类冲突处理 |
| 开源研究 | 8 个 GitHub 项目的 star 快照、维护状态和许可证边界 |
| 核心教学 | 角色、运营、治理、Team Lead 四条完整决策路径；三幕课堂与工作件体系 |
| 案例 | 输入表、教学模板、5 个强制标注的合成案例、catalog schema、确定性 RAG、无匹配不编造 |
| 认证 | Foundations rubric、Ed25519 签名/验证/撤销、HTML 证书、opt-in Yearbook |
| 兼容 | 0.1 学习存档保持可读；新增节点不扩大 Foundations 证书含义 |
| 开源入口 | README、CONTRIBUTING、MIT 和机器可读 manifest |

## canonical 文件

- `skills/agentboss-school/references/curriculum-framework.md`：知识与课程架构；
- `skills/agentboss-school/research/source-registry.json`：来源台账；
- `skills/agentboss-school/research/claim-map.json`：声明、冲突与课程口径；
- `skills/agentboss-school/research/open-source-projects.json`：GitHub 与许可证审查；
- `skills/agentboss-school/manifest.json`：正式可用课程节点；
- `skills/agentboss-school/references/cases/_case-intake-template.md`：未来案例输入框架；
- `skills/agentboss-school/references/certification.md`：认证与 Yearbook 边界。

当本文件与上述 canonical 文件冲突时，以机器 registry、manifest 和对应 policy 为准。

## 知识纳入流水线

```text
发现一手来源
  → 登记版本、等级、适用范围和限制
  → 提取最小可检验 claim
  → 检查重复、定义、事实、工程、政策和时间冲突
  → 映射到一个主节点
  → 写成决定框架、失败模式、实操和完成证据
  → 自动校验引用与课程图
  → 才进入正式课程
```

文章全文、项目 README 和客户原始资料都不直接进入 lesson 或 RAG。

## 后续维护重点

### 证据与案例

- 先收 3–5 个有授权的案例，覆盖正常、失败、结果未知和安全事件；
- 为检索建立固定 query set，分别评测召回、引用和教学适配；
- 案例结果保持 `UNVERIFIED / SOURCE_BACKED / CLIENT_VERIFIED`，不得由营销人员自行升级。

### 认证边界

- 当前只签发 Foundations；完整课程不自动产生 Operator、Governor 或 Team Lead 证书；
- 未来进阶认证必须使用独立 rubric、`credentialType`、提交 schema 与签发测试；
- 付费陪跑和 FDE 始终不能替代课程证据。

## 验证记录

- 课程校验：4 courses / 30 nodes 通过；
- AgentBoss School 专项测试：8/8 通过；
- HTTP 测试：11/11 通过（需允许本机回环监听）；
- E2E：9/9 通过；
- TypeScript、依赖边界、独立运行、研究治理、构建和 3D 性能检查通过；
- 当前生产依赖门禁使用 `npm audit --omit=dev --omit=optional --audit-level=moderate`，无 moderate/high/critical；未使用的 Drizzle Kit CLI 不进入生产镜像；
- 整仓 secret gate 仍命中两个既有测试 fixture 的 literal secret assignment，本次未修改这些文件。
