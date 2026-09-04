# ADR 0015：采用独立 Workforce Graph 取代办公室作为主要关系表达

状态：Accepted。

日期：2026-08-23。

## 背景

多轮 3D、整房图片、2.5D 分层与人物移动试验没有达到足够专业、清晰和自然的产品质量。用户选择 Relevance AI Workforce 的节点画布作为新的视觉与交互基线，同时要求 Company OS 保留粘土风真人和小鱼头像。

## 决策

Company OS 的主要组织/协作/责任表达采用二维无限画布与节点图：

- Web adapter 使用 MIT 许可的 React Flow。
- 自动布局仅使用 MIT 许可的 Dagre。
- Company OS 保持 renderer-neutral graph projection。
- 粘土头像是可替换的展示资产，不进入领域模型。
- 办公室与 3D/2.5D 试验退出产品范围；实现、素材和生产工具链均删除。
- 复刻 Relevance 的布局与交互语言，但不复制其商标、客户资产、文案、视频、私有代码或后端语义。

## 原因

- 与真人—Agent—审批—证据的责任关系天然匹配。
- 信息密度和可读性明显优于房间场景。
- DOM/SVG 节点可以精确响应、访问和测试。
- 可在移动端保持节点可读，通过平移与聚焦浏览。
- 无需 3D 加载、骨骼、遮挡、路径寻找和大量美术修磨。
- React Flow 覆盖大部分非差异化画布工程，Company OS 只维护差异化节点与责任语义。

## 边界

`@xyflow/react`、React 与 Dagre 只能出现在 Web 层。`core`、`ports` 和 `application` 只知道 Company OS 自有的 graph projection DTO。

## 后果

- Web 层将新增一个隔离 React island；不要求重写整个现有 Web。
- 需要新增第三方 notices、source manifest、版本锁定与视觉回归。
- 删除旧 Office Compiler、渲染端口、渲染器、专用测试和资产，避免形成第二套产品模型。
- 粘土头像的质量要求从“全身场景角色”降低为一致的透明背景头像组。

## 退出策略

如果未来替换 React Flow，只需重写 `web/workforce-graph` adapter。持久化图数据、责任语义、节点 ID、视口与坐标仍为 Company OS 自有格式。
