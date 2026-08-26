# 为 AgentBoss School 贡献

## 贡献知识

1. 在 `research/source-registry.json` 登记一手 URL、证据等级、状态、适用节点、用途和限制。
2. 把文章拆成最小可检验主张，加入 `research/claim-map.json`；不要提交文章摘要堆砌。
3. 检查与现有定义、事实、工程取舍、项目政策和版本是否冲突。
4. 一个 lesson 只解决一个主要决定，并包含框架规定的十个标题。
5. 运行课程校验和专项测试。

核心治理或安全主张需要 A 级来源；工程模式至少需要 B 级一手来源。供应商营销、demo、benchmark 和 star 不能证明生产效果。

## 贡献 GitHub 项目研究

先登记官方仓库，再在 `research/open-source-projects.json` 记录 star 快照、维护状态、代码/文档/目录级许可证、可借鉴模式和版权边界。Star 只用于发现候选。

默认不复制代码、文档、图表、截图、logo 或数据。确实需要复制时，先单独提交 attribution 评审，记录精确文件、commit、SPDX、copyright notice、修改和用途；未知许可证或 source-available 内容不能并入 MIT 部分。

## 贡献案例

使用 `references/cases/_case-intake-template.md`，不要直接提交原始公司材料。客户案例必须有明确授权、匿名化结果和逐条结果验证；演示与合成案例必须显式标 `ILLUSTRATIVE`，不能支持 ROI 或客户效果声明。

## 商业与认证边界

- 免费课程不能因未购买陪跑或 FDE 而受限；
- 服务购买不能替代课程证据或提高证书等级；
- Yearbook 默认不公开，必须有单独同意；
- 不使用“学历”“政府认证”或受监管职业资格等误导表述。

## 提交前

```bash
npm test
```

当前仓库不包含第三方视觉资产。若未来确需加入，必须先在独立 PR 中登记精确来源、许可证、copyright notice、修改和用途；在权利边界审核完成前不得提交资产文件。
