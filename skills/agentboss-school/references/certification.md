# AgentBoss School 课程认证与 Yearbook

## 专业名称

- 中文：**Agent Boss 基础能力证书**
- 英文：**Agent Boss Foundations Certificate**
- 类型 ID：`AGENT_BOSS_FOUNDATIONS`
- 发行方：`AgentBoss School`
- 公共名录：**AgentBoss School Yearbook · 校友名录**

这是经过发行方审核的课程能力证书，不是政府资质、学历、学位、受监管职业执照，也不授予“认证顾问”等法律或商业身份。证书不设自动过期，但始终显示课程版本和签发日期；新课程版本不会改变旧证书所证明的范围。

## 三层记录

1. **学习存档**：记录学过什么，只在本地；不能作为公开证书。
2. **完课提交**：达到课程门槛并由审核人填写 `completion-submission`；仍不是证书。
3. **签名凭证**：发行方使用 Ed25519 私钥签发，公钥可验证，才是正式课程证书。

不得让导师凭一段对话自动签发。发行方私钥不得写入仓库、学习状态、环境示例、日志或 Yearbook。

## Foundations 达标规则

申请人必须同时满足：

1. 完成 `manifest.json.defaultPath` 的全部节点；
2. `shared/demo-responsibility-loop` Lab 达到 `capable` 或 `strong`；
3. `delegation`、`operations`、`governance` 三项能力均达到 `capable` 或 `strong`；
4. 能解释真人责任、结果合同、准确动作审批和证据验收；
5. 由 AgentBoss School 授权审核角色完成 `ISSUER_REVIEW`；
6. 提交中不包含原始公司文档、生产数据、凭据、联系方式或 Agent 私有推理。

`teamAdoption` 在 Foundations 可为 `unknown` 或 `developing`，它属于后续团队陪跑与进阶课程，不应为了发基础证书而虚报。

完成 Operator、Governor 或 Team Lead 课程节点目前只形成学习记录与工作件，不产生新的签名证书，也不能在 Foundations 凭证中追加相应称号。课程覆盖范围扩大与凭证证明范围严格分开。

## 颁发流程

1. 复制 `credentials/completion-submission.example.json`，填写最小完成证据。
2. 审核人核对状态、Lab 决策和证据引用；不把原始证据复制进提交。
3. 学员单独选择是否进入 Yearbook。默认 `yearbookConsent=false`。
4. 发行方在安全环境配置 Ed25519 私钥和对应公开 keyring。
5. 运行签发工具，生成签名 JSON 凭证。
6. 运行验证工具；需要可打印版本时生成 HTML。
7. 只有 `yearbookConsent=true` 时才能运行留册工具。

示例命令：

```bash
node scripts/issue-credential.mjs \
  --input completion-submission.json \
  --private-key /secure/path/issuer-private.pem \
  --key-id abs-issuer-2026 \
  --output credential.json

node scripts/verify-credential.mjs credential.json
node scripts/render-certificate.mjs credential.json --output certificate.html
node scripts/register-yearbook.mjs credential.json
node scripts/remove-yearbook-entry.mjs ABS-FND-2026-<credential-uuid>
```

## 签名、验证与撤销

- 签名算法固定为 `Ed25519`。
- 签名覆盖除 `signature` 外的完整 canonical JSON。
- `issuer-keys.json` 只保存公钥、有效期和状态。
- 私钥对应公钥必须与 `keyId` 完全匹配。
- 修改姓名、课程、届次、能力、日期或同意状态都会使签名失效。
- `revocations.json` 可按证书 ID 撤销误发、欺诈或已失效凭证；验证器必须检查撤销表。

稳定验证结果码：`VALID`、`INVALID_SCHEMA`、`UNKNOWN_ISSUER_KEY`、`KEY_NOT_ACTIVE`、`SIGNATURE_INVALID`、`CREDENTIAL_REVOKED`。

## Yearbook 隐私边界

Yearbook 只公开：

- 学员选择的公开姓名；
- 可选 public handle 和 HTTPS 个人主页；
- 届次；
- 证书名称与编号；
- 课程版本和签发日期；
- 公开凭证验证路径。

不公开邮箱、电话、学习日志、理解分数、证据摘要、公司、客户、联系方式或服务购买状态。撤回公开同意时运行退册工具，同时移除名录项和公开凭证副本；学员自己持有的签名证书不会因此撤销。证书有效性与是否公开留册分开处理。

## 商业边界

证书门槛只验证开放课程与 Lab，不要求购买 Agent Boss 陪跑或 FDE。付费服务不能成为发证条件，也不能提高基础证书等级。后续若建立进阶认证，必须使用新的 `credentialType`、独立 rubric 和版本化契约，不能悄悄扩大 Foundations 的含义。
