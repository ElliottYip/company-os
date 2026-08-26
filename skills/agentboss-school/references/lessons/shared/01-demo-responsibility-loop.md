# 实验课：跑通一次责任闭环

## 学习结果

学生能完成 assign → plan/activity → approval → result/evidence → responsibility 的闭环，并解释每一步中真人、Agent、权限、审批和证据的作用。

## 核心概念

这个 Lab 验证的不是模型聪不聪明，而是管理系统能否在不调用真实 Agent 的情况下，把责任闭环讲清并稳定复现。

Company OS Demo 使用固定的 `DEMO_FIXTURE`：真人 `demo-boss` 委派市场简报给 `demo-researcher`；Agent 形成计划并模拟读取获准数据；对外发布动作暂停等待精确审批；批准后记录结果证据与完整责任投影，拒绝则不发布。

## 决策框架

沿工作生命周期逐步核对责任链：目标是否绑定真人、执行是否在合同范围、观察是否有证据、高风险动作是否精确暂停、最终状态是否能解释。任一步缺失都不把闭环标为完成。

## 来源

- Company OS `adapters/demo/create-demo-composition.ts`：固定身份、工作、权限、数据授权、审批和证据 ID。
- Company OS `application/deterministic-demo-runtime.ts`：`assignTask()`、`advance()`、`decide()`、`reset()` 状态机。
- Company OS `docs/product-charter.md`：Demo 不调用真实模型、工具、文件系统、凭据、付费 API 或生产数据。
- `[CLM-005]` 支持用环境状态而非 Agent 文本判断完成；`[CLM-006]` 要求把过程 trace、结果证据和业务接受分开。

## 讲授

完整责任链至少能回答：

```text
谁提出目标？
哪个真人对结果负责？
哪个 Agent 执行？
使用了哪些权限和数据授权？
哪个高风险动作由谁审批？
什么证据支持过程和结果？
最终结果是什么，或者为什么没有结果？
```

如果系统只能显示“Agent 成功”，它仍然不是一个 Agent Boss 控制平面。成功状态必须能追到结果证据；高风险动作必须能追到准确审批；所有执行必须能追到真人责任合同。

Demo 刻意不使用真实模型。这样学习者看到的每个变化都来自责任状态机，而不是模型随机性或外部服务。它是训练和产品回归的共同教具，不是客户效果案例。

## 失败模式与边界

- 把固定 fixture 的稳定结果包装成客户成效；
- 只走批准分支，不练拒绝、过期和重提；
- 把日志条数当完成证据；
- Demo 证明状态机可复现，不证明模型、真实连接器或团队在生产中可靠。

## 实操

### 模式 A：Company OS 本地 Demo

仅在检测到 Company OS 仓库且学生希望操作产品时使用：

1. 确认页面明确显示 Demo/fixture 标签。
2. 若依赖已安装，启动 `npm run dev`；需要安装依赖时先取得学生同意。
3. 进入确定性 Demo，重置到初始状态。
4. 分配市场简报任务，观察真人负责人、执行 Agent、允许动作和状态。
5. 推进计划与模拟工具活动，核对只读取获准演示数据。
6. 到审批点先不要点击。核对发布动作、输入摘要、工作、Agent、真人、证据和有效期。
7. 选择批准或拒绝，并明确业务理由。
8. 检查结果证据和责任链；最后重置 fixture。

不得连接真实凭据、真实 Agent 或生产数据。若当前产品 UI 与 lesson 不一致，按可运行行为如实记录差异，不伪造完成。

### 模式 B：可复现桌面演练

产品不可用时，导师依次展示以下状态：

1. `IDLE`：尚无工作。
2. `PLANNING`：`demo-boss` 发起并负责，`demo-researcher` 执行。
3. `SIMULATING_TOOL_ACTIVITY`：计划已记录，模拟读取 `data-contract-demo-market`。
4. `AWAITING_APPROVAL`：`publish-content` 与 `sha256:demo-publish-action` 被暂停。
5. 分支：
   - `APPROVED`：写入结果证据，形成 `demo-result-001`；
   - `REJECTED`：不形成发布结果，保留拒绝决定和责任记录。
6. `RESET`：只清理 `DEMO_FIXTURE`，不得清理正式事件。

在审批点让学生作一次决定，并要求一句理由。然后共同核对七问责任链。

## 完成证据

Lab 完成需要观察到：

1. 能指出发起真人、负责真人和执行 Agent；
2. 能说出获准数据/动作与高风险发布的区别；
3. 审批时核对准确绑定而非只表达信任；
4. 能根据证据解释为什么接受、拒绝或重提；
5. 不把 fixture 结果称为真实生产效果。

满足 1–3 项记 `developing`，满足 4 项记 `capable`，五项全部满足且能解释拒绝分支记 `strong`。未实际观察则记 `unknown`。

## 降级路径

- 没有浏览器或依赖：使用桌面演练。
- 本地启动失败：报告具体失败，不声称产品 Lab 已运行；可继续桌面演练。
- 学生要求接生产系统：停止并说明本课程不授权生产访问，可把需求记为后续 FDE 或正式实施议题。

## 下一节点信号

- 主要缺口是概念或一次练习：继续免费课程，推荐最弱能力节点。
- 已有真实工作流，但责任、复盘或团队采用薄弱：读 `references/service-paths.md`，可选 Agent Boss 陪跑。
- 流程、系统或数据连接尚未构建：读 `references/service-paths.md`，可选 FDE 诊断。

服务分流必须在总结 Lab 证据之后，并同时提供“继续免费学习”。
