export const zhCN = {
  "app.name": "Company OS",
  "app.subtitle": "珊瑚实验室 · 确定性演示",
  "demo.badge": "DEMO FIXTURE · 仅模拟 Agent",
  "demo.companyAria": "演示公司结构",
  "demo.runningCompany": "正在运行的公司",
  "demo.companyName": "珊瑚实验室",
  "demo.accountability": "真人对目标、权限与高风险动作负责。",
  "demo.boss": "林澄（真人演示身份）",
  "demo.executors": "2 个模拟 Agent",
  "demo.externalCalls": "0 · 完全隔离",
  "nav.office": "办公室",
  "nav.workApprovals": "工作与审批",
  "nav.responsibility": "责任记录",
  "nav.connectors": "连接器",
  "office.title": "公司正在运转",
  "office.previewAria": "Pre-3D 办公室结构与占位状态预览",
  "office.previewLabel": "PRE-3D STRUCTURAL PREVIEW · 非最终 3D 效果",
  "office.fixtureAgent": "模拟 Agent",
  "office.accountableHuman": "真人负责人",
  "work.currentGoal": "当前目标",
  "work.goal": "形成带证据的市场简报并模拟发布",
  "responsibility.aria": "责任链",
  "responsibility.title": "谁对什么负责",
  "responsibility.initiator": "目标发起",
  "responsibility.executor": "执行 Agent",
  "responsibility.permissionsData": "权限与数据",
  "responsibility.approval": "真人审批",
  "responsibility.evidenceResult": "证据与结果",
  "events.title": "确定性事件流",
  "events.empty": "分配模拟任务后，事件会按固定顺序出现。",
  "action.assign": "分配模拟任务",
  "action.advance": "推进下一事件",
  "action.approve": "批准模拟动作",
  "action.reject": "拒绝",
  "action.reset": "一键重置",
  "demo.safetyFooter": "Demo 不连接模型、Relay、MCP、Shell、文件系统或企业数据。正式模式需重新绑定身份、权限与责任合同。",
} as const;

export type CompanyOSMessageKey = keyof typeof zhCN;

export function t(key: CompanyOSMessageKey): string {
  const value = zhCN[key];
  if (!value) throw new Error(`Missing Company OS translation: ${key}`);
  return value;
}

