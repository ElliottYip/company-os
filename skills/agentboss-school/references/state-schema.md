# 本地学习存档

## 位置与生命周期

- 默认目录：`~/.agentboss-school/`
- 默认文件：`~/.agentboss-school/me.json`
- 每次进入 School 时读取；每完成一个知识块、Lab 或理解判断后合并写回。
- 写入失败不阻断课堂，明确告诉学生进度未持久化。
- v1 存档可由更新的同一主版本课程读取；读取旧存档后保留已有节点证据，并在下一次正常写回时把 `curriculumVersion` 更新为当前版本。不得因新增可选节点清空进度。

## v1 结构

```json
{
  "schemaVersion": 1,
  "curriculumVersion": "0.7.1",
  "handle": "me",
  "displayName": null,
  "enrolledAt": "2026-08-24",
  "lastSeenAt": "2026-08-24",
  "currentCourse": "role",
  "lastNode": "role/not-a-prompt-engineer",
  "competencies": {
    "delegation": { "level": "developing", "basis": "完成角色边界情境判断" },
    "operations": { "level": "unknown", "basis": null },
    "governance": { "level": "unknown", "basis": null },
    "team_adoption": { "level": "unknown", "basis": null }
  },
  "nodes": {
    "role/not-a-prompt-engineer": {
      "status": "done",
      "comprehension": "capable",
      "evidenceNote": "能指出 Agent 不能承担组织责任",
      "at": "2026-08-24"
    }
  },
  "labs": {},
  "artifactReferences": [],
  "artifactStorageConsent": false,
  "deferredQuestions": [],
  "nextRecommended": "role/delegation-fit",
  "serviceRecommendation": {
    "category": "none",
    "status": "not-shown",
    "basis": null
  },
  "log": ["2026-08-24 入学并完成 Agent Boss 角色边界"]
}
```

## 枚举

- `currentCourse`: `role | operations | governance | team | null`
- 节点 `status`: `todo | in-progress | done | skipped`
- `comprehension`: `unknown | developing | capable | strong`
- 能力 `level`: `unknown | developing | capable | strong`
- 服务 `category`: `none | self-serve | agentboss-coaching | fde`
- 服务 `status`: `not-shown | shown | declined | requested`

## 隐私约束

只存简短的能力证据说明。禁止字段或内容包括凭据、密钥、token、cookie、密码、私有提示词、原始公司文档、生产数据、完整任务输入、Agent 私有推理和原始证据。

`artifactReferences` 只能在 `artifactStorageConsent=true` 后记录学生主动选择的本地路径或公开 URL；不得复制工件正文。服务状态只用于避免重复推销，不得自动上传。

写完后可运行：

```bash
node scripts/validate-state.mjs ~/.agentboss-school/me.json
```
