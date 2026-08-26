# AgentBoss School 实践系统

这套系统把“看懂课程”与“在压力下做出可检查决定”分开。它是 AgentBoss School 的项目化教学设计，不是外部标准，也不证明学员已经能在任意生产环境中胜任。

## 三层实践

### P1 · Worked Example

导师先展示完整工作件，同时指出错误直觉、关键证据和不能授权的动作。学生只修改一个需要业务判断的字段。P1 适合第一次接触概念，不能单独证明能力。

### P2 · Progressive Disclosure Lab

信息按轮次出现。学生必须更新同一份决策记录，不能看到结局后倒推答案。Lab 检查四件事：决定是否与当前证据相容、是否引用了必要证据、是否冻结危险动作、是否保留负责人和恢复条件。

### P3 · Environment Lab

在受控环境中执行真实状态转移、审批、工具失败、重试或回退，并用环境结果验收。Company OS 确定性 Demo 属于 P3 的最小实现；它仍是 `DEMO_FIXTURE`，不是生产验证。以后接入模型、连接器或企业沙箱时，必须另行记录版本、数据授权、成本与环境差异。

## 当前可运行的 P2 Labs

列出场景：

```bash
node scripts/run-practice-lab.mjs --list
```

逐轮读取信息：

```bash
node scripts/run-practice-lab.mjs --scenario outcome-unknown --round 1
node scripts/run-practice-lab.mjs --scenario outcome-unknown --round 2
node scripts/run-practice-lab.mjs --scenario outcome-unknown --round 3
```

生成空白提交并在外部保存：

```bash
node scripts/run-practice-lab.mjs --template outcome-unknown
```

检查结构化提交：

```bash
node scripts/run-practice-lab.mjs --score outcome-unknown --submission /path/to/submission.json
```

内置场景：

| 场景 | 对应节点 | 主要压力 |
|---|---|---|
| `outcome-unknown` | `shared/outcome-unknown-tabletop` | 超时、索引延迟、重复副作用、对账 |
| `agent-security` | `shared/agent-security-tabletop` | 不可信输入、工具企图、运行时阻断、trace 泄露 |
| `team-pilot` | `shared/team-pilot-studio` | 不可比基线、阻断失败、人工负担、所有权缺口 |

全部场景都是 `SYNTHETIC_SCENARIO / ILLUSTRATIVE / UNVERIFIED`。现实感来自证据顺序、约束和取舍，不来自虚构客户、营收或成功率。

## 双轨评分

### 机器检查

机器总分 100，80 为该练习的结构通过线：

| 项目 | 分值 |
|---|---:|
| 场景绑定与轮次完整 | 10 |
| 动作与当前证据相容 | 30 |
| 引用必要证据 | 24 |
| 显式冻结危险动作 | 18 |
| 理由、负责人、恢复条件 | 18 |

这个 80 分是 AgentBoss School 的练习阈值，不是行业基准。评分器会拒绝空值、常见占位词和低信息重复字符，但它仍只能检查预先编码的可观察字段，不能判断解释是否深入、证据是否在真实系统中可信，也不能防止照抄答案。

### 导师审阅

导师再判断四项：

1. 学员有没有使用当轮尚未出现的信息；
2. 理由是否解释了风险机制，而不是复述动作名称；
3. 恢复条件是否可被外部证据验证；
4. 面对替代路径时，能否说明适用边界。

出现任一阻断错误——例如重复付款、把提示词当权限控制、平均掉明确阻断项、删除事故证据——即使机器分数达到 80，也不能评为 `capable`。导师反馈仍使用“成立决定、缺失证据、不能授权、下一最小动作”四句结构。

## 证据边界

- P1 证明接触与理解线索；
- P2 证明在合成情境中能维持决策链；
- P3 证明在指定受控环境中完成过操作；
- 授权真实案例和真实学员前后测才可能支持外部有效性判断。

因此当前课程可以记录练习成绩和导师判断，但不能把 P2/P3 成绩宣传成客户效果、生产胜任力或行业认证。
