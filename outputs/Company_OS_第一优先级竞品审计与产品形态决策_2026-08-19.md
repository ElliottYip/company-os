# Company OS 第一优先级竞品审计与产品形态决策

日期：2026-08-19  
状态：审计完成；方向 B 已由产品负责人于 2026-08-19 接受

## 已接受的最终方向

产品负责人已选择 **“责任优先的 AI Native Company System of Record + Agent Boss
执行控制面”**。

Company OS 不应成为 Paperclip 式通用 Agent 编排器，也不应只做 ServiceNow
式 AI 资产治理 overlay，更不应把 Sintra 式虚拟 AI 团队当作核心领域。
核心是把真人负责人、Agent、岗位/组织、权限与数据合同、工作、精确动作审批、
证据和结果做成同一条可执行责任链。Agent runtime、模型和企业系统均通过平等
Connector 接入；独立中文/双语 Web、粘土品牌和虚拟办公室是日常产品入口。

## 审计范围与证据边界

深入审计了 Paperclip、AgentSpace、StaffDeck、Provision 的关键模块和端到端
主链；每个项目固定一个 SHA/tag、许可证和 tracked-path inventory。

- Paperclip 既有 704/1,560 个细粒度证据全部保留为可信附录；不重读，不追求
  其余 856 项清零。
- AgentSpace、StaffDeck、Provision 使用代表性关键代码验证，不声称 100%
  逐文件审计。
- 三个仓库的依赖未安装，代表性测试命令无法启动；没有把“测试代码存在”写成
  “测试运行通过”。
- Symphony、AgentArea、HumanLayer ACP、Agent Room、OpenWorker、Agent
  Control、Mesa 及其他候选均暂停，没有静默标记为完成或拒绝。
- 商业竞品只研究官方公开产品边界；未公开的 schema、价格、部署、数据退出和
  责任语义保持 Unknown。

## 四个开源项目结论

| 项目 | 固定版本 / 许可证 | 成熟度 | 产品判断 | 最适合借鉴 | 不采用 |
| --- | --- | ---: | --- | --- | --- |
| Paperclip | `213dabab…` / MIT | 4/5 | `NARROW` | 通用工作控制面、迁移/锁/恢复、Plugin、Secrets | 整体基座、schema、Web、generic responsibility |
| AgentSpace | `0f9da1b…` / Apache-2.0 | 2.5/5 | `NARROW` | 多 CLI router、远程 daemon | Workspace 大聚合、snapshot 双真相、弱审批/数据策略 |
| StaffDeck | `v0.4.1` `b18aebb…` / AGPL-3.0-only | 3/5 | `PARTNER` | durable invocation、国内渠道、SOP/skill | 默认 Fork/复制、unsafe sandbox defaults、弱责任审批 |
| Provision | `535cdbd…` / MIT | 3/5 | `NARROW` | 云部署、installer、daemon heartbeat、checkout lease | 结果幂等、Secret 下发、事后审批、生产 Docker 默认 |

四个项目均不应整体 Fork。本轮没有复制任何竞品代码。未来复制必须独立批准，
记录源文件、完整 SHA、许可证、hash、本地修改和测试；StaffDeck 默认仅 clean-room
学习，除非主动接受 AGPL 网络源码义务。

## 每类能力唯一最佳参考

| 能力 | 唯一最佳参考 | Company OS 处理 |
| --- | --- | --- |
| Goal/Task/Run/Budget/Artifact/Heartbeat | Paperclip | 复用不变量，自有 schema/API |
| invocation 幂等、lease、未知副作用 | StaffDeck | clean-room 实现 `outcome_unknown` |
| 数据库 migration/backup/extension isolation | Paperclip | 独立实现 checksum/lock/safety lint |
| Plugin/extension protocol | Paperclip | 缩小为 Company OS-owned contract |
| 多 CLI 本地 Agent 适配 | AgentSpace | 学习分层，禁止 raw env/private session |
| 云主机/Docker Agent 部署 | Provision | 学习 provider/installer/upgrade，不以 Docker socket 为生产默认 |
| 国内渠道、SOP、skill | StaffDeck | clean-room Connector/FDE template |
| Secret 生命周期 | Paperclip | 自有 SecretPort、KMS/Vault/local provider |
| 并发审批决策 | Paperclip | 增加 exact action/digest/contract/human/evidence/result |
| 混合真人/Agent 组织与责任 | Company OS | 自有 canonical domain |
| 数据授权与出口防火墙 | Company OS | 自有 canonical domain |
| 中文温暖 Web 与办公室 | Company OS | 自有 Web、tokens、assets、Office Compiler |

## 商业竞品边界

- Workday ASOR：最值得学习 delegate/ambient 身份分离、skill-scoped Agent
  System User 和 blended workforce registry；不能继承 Workday tenant 锁定。
- Microsoft Agent 365：owner/sponsor/manager 与跨厂商安全治理强；适合作为
  Entra/M365 合作入口，不作为产品底座。
- ServiceNow AI Control Tower：AI asset/model/identity/MCP inventory、steward
  approval、CMDB/ROI 强；责任链不能退化成资产台账。
- Salesforce Agentforce：action metering 和 CRM action/channel 部署可参考；
  不做 CRM-native proprietary runtime。
- Relevance AI、Sintra、Lindy：学习 workforce builder、edge approval、named
  team、消息入口与默认草稿审批；不采用 hosted runtime 持有一切的边界。
- Artisan/11x：学习 audit→design→deploy→scale、白手套 onboarding 和 FDE
  包装；不采用代人发送、单垂类和“替代员工”叙事。
- OpenAI Presence：最强 FDE 生产闭环参考——job-scoped access、simulation/
  eval、人工批准 rollout、持续改进；其 OpenAI-only managed limited GA 不可复制。

## 三种互斥产品方向

1. **通用开源 Agent 编排平台**：与 Paperclip 正面同质竞争。结论 `STOP` 作为
   主形态，只学习运行不变量。
2. **责任优先 Company System of Record + Agent Boss**：结论 `GO`。这是推荐
   方向，也是 Company OS 差异化最坚固的组合。
3. **温暖 SMB AI Workforce / 虚拟办公室**：结论 `NARROW`。只作为方向 2 的
   Demo 和体验层，不能取代企业责任、身份、数据与部署核心。

## 审计带来的架构修正

必须在后续实现中增加：`outcome_unknown`；capability freeze + execution-time
reauthorization；attempt fencing；transactional outbox/cursor/checkpoint；Secret
delivery 与 access audit 的 fail-closed 顺序；Connector trust tiers；migration
checksum/advisory lock/safety lint/expand-contract；managed/self-hosted 相同的
compatibility 和数据退出测试。

## 已确认的实施顺序

1. 责任优先领域、attempt fencing、outbox、migration safety；
2. Connector SDK、Secret/Data/Identity ports、本地执行节点；
3. 确定性 Demo 三分钟责任闭环和 Agent Boss MVP；
4. 模型/数据/权限/出口管理与 FDE 行业模板；
5. 响应式自有 Web、Pre-3D Office Compiler、实体状态和 renderer contract；
6. focused unit/integration/E2E、类型、构建、边界与安全验证；
7. 到需要正式制作 3D 角色、场景、骨骼、动画资产时停止。

方向 2 已确认，审计冻结解除。后续实现必须服务于责任优先架构；正式 3D 角色、
场景、骨骼和动画资产仍保持冻结，直到 Pre-3D 纵切和全部验证通过。
