# Relevance AI Workforce 视觉与交互审计

状态：完成取证，等待 Company OS 画布实现。

审计日期：2026-08-23。

## 结论

Company OS 应复刻 Relevance AI Workforce 的**画布信息密度、节点比例、连线语言、视口行为、响应式收缩方式和轻动效节奏**，而不是复制其商标、Logo、客户标识、案例、营销文案、视频、插画或私有产品代码。

目标不是继续制作办公室房间，也不是把 Relevance AI 当运行时依赖。目标是 Company OS 自有的“真人负责、Agent 执行”工作关系画布：外观与目标参考在可测量层面高度一致，领域语义、数据、头像与品牌完全属于 Company OS。

## 取证范围

2026-08-23 对 `https://relevanceai.com/workforce` 做了真实浏览器桌面与移动端检查：

- 桌面视口：1219 × 1013。
- 移动视口：390 × 844。
- 页面高度约 5990 px。
- 检查了顶部、Hero、能力卡、集成区、案例区、FAQ、CTA、页脚和移动菜单。
- 检查了字体、关键颜色、脚本、样式表和加载资产。
- 检查了 Relevance AI 官方 Workforce、Nodes、Agent 连接与 Tools 文档。

这次审计确认官网使用 Astro 分块加载；Hero 中的 Workforce 图不是 3D 场景，而是节点卡、SVG 连线、点阵背景、状态标签和轻动效组成的视觉画布。

## 可测量视觉基线

### 桌面

- 固定白色顶部栏，高度约 64 px，底部 1 px 浅灰分隔线。
- Hero 为左右双栏：左侧大标题，右侧说明与两个胶囊按钮。
- 标题字体为 Sora，正文为 Inter。
- 桌面 H1 约 48/57.6 px，字距约 -2.4 px，颜色约 `#0d162f`。
- 正文约 16/25.6 px，颜色约 `#868a97`。
- 主画布外框为紫色柔和渐变；内层为近白点阵无限画布。
- 节点是白色圆角卡片，阴影非常轻，边框比阴影更重要。
- 连线以低对比灰色正交折线为主，端点与流向使用小圆点/箭头表达。
- 激活或运行状态使用少量紫色、绿色、橙色，不铺满整张卡片。

### 移动端

- 顶栏只保留 Logo 与汉堡菜单。
- 菜单从右侧滑入，宽度约为视口的 82%，底部固定登录和主 CTA。
- Hero 变成单栏，标题、正文、按钮、画布依次排列。
- 画布没有压缩成不可读缩略图，而是保持节点尺寸并裁切/横向溢出。
- 目标 Company OS 画布应采用相同原则：移动端优先保留可读节点，通过平移与聚焦浏览，而不是把完整组织图缩成邮票。

## Relevance 真实产品主链

官方文档确认其 Workforce Builder 的基本对象是：

1. Trigger：启动工作流。
2. Agent：执行专业工作。
3. Tool：独立、可复用的能力节点。
4. Condition：路由条件。
5. Edge：AI 自主转交或强制 Next step。
6. Task View：观察执行、批准和 Agent 间转交。

这套视觉可复用，但 Company OS 不能照搬其责任语义。Company OS 的画布必须额外表达：

- accountable human；
- 责任合同；
- 数据授权与出口边界；
- 高风险审批绑定；
- 证据与结果；
- Agent Connector 与运行证明；
- 真实组织汇报关系和任务执行关系的区别。

## “1:1”复刻与替换矩阵

| 目标参考 | Company OS 实现 | 判断 |
| --- | --- | --- |
| 画布尺寸、留白、点阵、缩放和平移 | 同比例实现 | 复刻 |
| 节点卡尺寸、圆角、边框、阴影、端口 | Company OS 自有 CSS | 复刻 |
| 正交连线、标签、运行脉冲 | Company OS 自有 Edge | 复刻 |
| 右侧编辑抽屉与移动端全屏抽屉 | Company OS 自有表单 | 复刻 |
| 运行状态与选中状态 | 使用 Company OS 状态机 | 复刻视觉，替换语义 |
| Relevance Logo、商标和紫色品牌符号 | Company OS 品牌 | 禁止复制 |
| 客户 Logo、案例、视频和营销文案 | Company OS Demo fixture | 禁止复制 |
| Relevance Agent 头像 | Raft 获准小鱼副本与 Company OS 粘土真人 | 替换 |
| Relevance 私有 API、数据库和运行时 | Company OS ports/application | 禁止依赖 |
| 官网 bundle 与私有前端源码 | 不复制 | 禁止复制 |

## 开源积木审计

### ADOPT：`@xyflow/react`

- 官方仓库 MIT。
- 当前官方包提供自定义节点、边、Handle、Viewport、拖拽、连接、选择、缩放、平移、MiniMap、键盘和可访问性能力。
- React Flow 只属于 `web` 层，不允许类型进入 `core`、`ports` 或 `application`。
- Company OS 的 canonical graph schema 仍是自有、renderer-neutral DTO；React Flow node/edge 只在 Web adapter 中生成。
- 固定具体版本与完整锁文件；升级时跑兼容测试和视觉回归。

### ADOPT：`@dagrejs/dagre`

- 官方仓库 MIT。
- 仅负责初次布局、重新排列和小型有向图稳定布局。
- 不作为业务模型或持久化格式。
- 用户手工移动后的坐标由 Company OS 保存；Dagre 不在每次渲染时重算，避免节点跳动。

### 不采用

- Rete.js：编辑器抽象更重，会与 Company OS 自有节点语义竞争。
- LiteGraph.js：Canvas 绘制使 DOM 可访问性、自有 CSS 精确控制和移动端表单整合更困难。
- Drawflow：虽然接入简单，但维护面、类型和复杂图能力不如 React Flow。
- JointJS/jsPlumb：商业/许可证和产品边界更复杂，当前无收益。
- tldraw：白板能力远超需求，许可证与运行面更大。
- ELK.js：复杂布局能力更强，但首版责任图规模不需要其异步布局与配置成本。
- 3D/Three.js/Pixi/Unity：不适合这条信息画布，不进入实现。

### 不新增的库

- 菜单、Tooltip 与抽屉先用语义化 DOM、CSS 和现有组件实现。
- 轻动效使用 CSS transform/opacity 和 `prefers-reduced-motion`，不引入动画框架。
- 图标使用项目自有 SVG/现有图标策略，不复制 Relevance 图标资产。

## 最小 Web 架构

```text
application projection
        │ renderer-neutral DTO
        ▼
workforce-graph-adapter.ts
        │ maps only at Web boundary
        ▼
React Flow nodes/edges
        ├── HumanNode (clay avatar)
        ├── AgentNode (Raft fish/clay variant)
        ├── WorkNode
        ├── ApprovalNode
        ├── DataBoundaryNode
        ├── EvidenceNode
        └── ResponsibilityEdge
```

核心约束：坐标、折叠状态和用户视口可以持久化；React 组件、CSS class、Relevance 枚举和 React Flow 内部类型不得持久化。

## 粘土头像规范

- 真人与 Agent 都使用透明背景、同一光向、同一相机高度和同一裁切比例。
- 头像只占节点左侧 36–44 px，不再把人物放进房间或工位。
- 真人节点使用圆角方形头像；Agent 节点可使用小鱼轮廓，但保持同一外框和信息层级。
- 状态不靠改头像颜色表达，使用边框、状态点和小标签，避免粘土资产变脏。
- 必须提供文字名称、岗位与状态，头像不是唯一识别方式。

## Company OS 画布节点规格

首版建议尺寸：

- Agent/Human：220–248 × 72–88 px。
- Trigger/Approval/Tool：180–220 × 48–64 px。
- 节点圆角：12–14 px。
- 头像：40 px。
- 端口：8 px 视觉直径，至少 24 px 点击热区。
- 节点间距：横向 56–72 px，纵向 72–96 px。
- 画布点阵：16–20 px 间距，1 px 低对比点。
- 右侧抽屉：桌面 360–420 px；移动端全宽。

## 交互状态

必须实现：

1. 平移、滚轮缩放、触控缩放、适配视图。
2. 节点选择、键盘焦点、打开详情抽屉。
3. 连接预览、合法连接校验、连接类型标签。
4. 运行态 Edge 脉冲，但不持续制造大面积动画。
5. 高风险节点暂停，批准/拒绝后恢复或终止。
6. 责任链高亮：目标发起人 → accountable human → Agent → 审批人 → 证据 → 结果。
7. 移动端单节点聚焦和底部/全屏详情面板。
8. Demo 重置后恢复确定性初始布局。

## 性能预算

- 首屏不加载现有 GLB 或 Three.js office runtime。
- 首屏节点建议不超过 80 个；更大组织按部门/项目折叠。
- 头像使用本地 AVIF/WebP/PNG，单张目标小于 80 KB。
- 只对运行中的少数 Edge 做动画。
- 视口外节点由 React Flow 的可见性优化处理；详情数据按选中节点加载。
- 移动端首屏 JS gzip 目标小于 220 KB，头像除外。

## 验证门槛

- focused unit：projection → graph DTO、连接合法性、布局稳定性、责任链高亮。
- integration：添加节点、连线、审批暂停/恢复、保存/恢复视口。
- E2E：桌面 1440×900、桌面 1219×1013、移动 390×844。
- visual regression：目标截图与实现按锚点比较，允许品牌/文案/头像差异，不允许布局漂移。
- accessibility：键盘可选节点、抽屉焦点管理、ARIA label、非颜色状态提示。
- boundary guard：禁止 `@xyflow/*`、React 和 Dagre 出现在 `core`、`ports`、`application`。

## 分期实施

1. 建立隔离的 `web/workforce-graph/`，接入 React Flow 与 Dagre。
2. 先复刻 Hero 画布的视觉骨架与响应式行为，使用确定性 Demo fixture。
3. 替换成 Company OS 真人、Agent、审批、数据、证据节点。
4. 接入现有 application projection，不直接调用 Demo runtime 内部对象。
5. 完成编辑抽屉、连线校验和责任链高亮。
6. 完成桌面/移动 E2E、视觉回归、性能与依赖边界验证。

## 来源与许可证

- Relevance AI Workforce 官网与官方文档：仅作为行为、比例和产品能力参考，不复制其源码或品牌资产。
- xyflow/xyflow：MIT，实际引入时在 source manifest 与第三方 notices 中固定版本、完整 SHA 与许可证文本。
- dagrejs/dagre：MIT，实际引入时执行相同 provenance 记录。
