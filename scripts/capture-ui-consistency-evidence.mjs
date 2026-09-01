import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.COMPANY_OS_QA_URL ?? "http://127.0.0.1:4173";
const requestedPhase = process.argv[2] ?? "before";
const phase = ["before", "after", "quality-before", "quality-after", "refinement-before", "refinement-after"].includes(requestedPhase)
  ? requestedPhase
  : "before";
const outputRoot = new URL(`../output/playwright/ui-consistency-${phase}/`, import.meta.url);

const coreConfigurations = [
  { id: "zh-1440", locale: "zh-CN", viewport: { width: 1440, height: 900 } },
  { id: "en-1440", locale: "en", viewport: { width: 1440, height: 900 } },
  { id: "zh-1024", locale: "zh-CN", viewport: { width: 1024, height: 768 } },
  { id: "en-1024", locale: "en", viewport: { width: 1024, height: 768 } },
];
const narrowConfigurations = [
  { id: "zh-768", locale: "zh-CN", viewport: { width: 768, height: 1024 } },
  { id: "en-768", locale: "en", viewport: { width: 768, height: 1024 } },
  { id: "zh-320", locale: "zh-CN", viewport: { width: 320, height: 740 } },
  { id: "en-320", locale: "en", viewport: { width: 320, height: 740 } },
];
const configurations = phase.startsWith("quality-") || phase.startsWith("refinement-")
  ? [...coreConfigurations, ...narrowConfigurations]
  : coreConfigurations;

const pageNames = {
  "zh-CN": {
    enterDemo: "体验 Company OS 公开 Demo",
    dashboard: "仪表盘",
    agents: "Agent",
    work: "任务",
    approvals: "审批",
    governance: "接入与治理",
    usage: "用量与计费",
    evidence: "证据",
    triggerApproval: "触发 Governed 工作流",
    reviewEvidence: "查看证据",
    closeEvidence: "关闭证据",
    requestRenewal: "申请续期",
    closeRenewal: "关闭续期",
    portfolioHeading: "Agent 资产组合",
  },
  en: {
    enterDemo: "Explore the Company OS demo",
    dashboard: "Dashboard",
    agents: "Agents",
    work: "Tasks",
    approvals: "Approvals",
    governance: "Governance",
    usage: "Usage & Billing",
    evidence: "Evidence",
    triggerApproval: "Trigger governed workflow",
    reviewEvidence: "Review evidence",
    closeEvidence: "Close evidence",
    requestRenewal: "Request renewal",
    closeRenewal: "Close renewal",
    portfolioHeading: "Agent Portfolio",
  },
};

const localNames = {
  "zh-CN": {
    setup: /配置 Company OS/,
    companyName: "公司名称",
    companyMission: "公司使命",
    continue: "继续",
    departmentName: "部门名称",
    humanName: "负责人姓名",
    humanRole: "岗位与职责",
    agentName: "Agent 名称",
    agentRole: "Agent 岗位",
    createCompany: "创建公司",
    viewHuman: "查看 Alex Chen",
    close: "关闭",
    addAgent: "添加 Agent",
    newTask: /新建任务/,
  },
  en: {
    setup: /Set up Company OS/,
    companyName: "Company name",
    companyMission: "Company mission",
    continue: "Continue",
    departmentName: "Department name",
    humanName: "Human name",
    humanRole: "Role and responsibility",
    agentName: "Agent name",
    agentRole: "Agent role",
    createCompany: "Create company",
    viewHuman: "View Alex Chen",
    close: "Close",
    addAgent: "Add Agent",
    newTask: /New task/i,
  },
};

await mkdir(outputRoot, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const evidence = [];

async function inspect(page, configuration, name) {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  const metrics = await page.evaluate(() => {
    const typography = (selector) => {
      const root = document.querySelector(selector);
      if (!root) return [];
      const counts = new Map();
      for (const element of root.querySelectorAll("h1, h2, h3, p, span, strong, small, button, a, dt, dd, label, input, textarea, select")) {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const style = getComputedStyle(element);
        const key = [style.fontFamily, style.fontSize, style.lineHeight, style.fontWeight].join(" | ");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return [...counts.entries()]
        .map(([style, count]) => ({ style, count }))
        .sort((left, right) => right.count - left.count);
    };
    const active = document.activeElement;
    const openDialog = document.querySelector("dialog[open]");
    const content = document.querySelector(".app-main");
    const dialogRect = openDialog?.getBoundingClientRect();
    const contentRect = content?.getBoundingClientRect();
    return {
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      activeElement: active instanceof HTMLElement
        ? active.getAttribute("aria-label") || active.textContent?.trim().slice(0, 80) || active.tagName
        : null,
      openDialogs: document.querySelectorAll("dialog[open]").length,
      openDialogRect: dialogRect ? {
        x: dialogRect.x,
        y: dialogRect.y,
        width: dialogRect.width,
        height: dialogRect.height,
        right: dialogRect.right,
      } : null,
      contentRect: contentRect ? {
        x: contentRect.x,
        width: contentRect.width,
      } : null,
      dialogContentCenterDelta: dialogRect && contentRect
        ? (dialogRect.x + dialogRect.width / 2) - (contentRect.x + contentRect.width / 2)
        : null,
      visibleControlsBelowViewport: [...document.querySelectorAll("button, input, textarea, select")]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.top >= window.innerHeight;
        })
        .length,
      typography: {
        rail: typography(".company-rail"),
        main: typography(".app-main"),
      },
    };
  });
  const path = `${configuration.id}-${name}.png`;
  await page.screenshot({ path: new URL(path, outputRoot).pathname, fullPage: true });
  evidence.push({ configuration: configuration.id, locale: configuration.locale, name, path, ...metrics });
}

for (const configuration of configurations) {
  const context = await browser.newContext({ viewport: configuration.viewport });
  await context.addInitScript((locale) => {
    window.localStorage.setItem("company-os.locale.v1", locale);
  }, configuration.locale);
  const page = await context.newPage();
  const consoleProblems = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      consoleProblems.push({ type: message.type(), text: message.text() });
    }
  });
  page.on("pageerror", (error) => consoleProblems.push({ type: "pageerror", text: error.message }));
  const names = pageNames[configuration.locale];

  await page.goto(baseUrl);
  await inspect(page, configuration, "front-door");
  await page.getByRole("button", { name: names.enterDemo }).click();
  await page.getByRole("heading", { name: names.portfolioHeading }).waitFor();
  await inspect(page, configuration, "dashboard");

  for (const [name, navigationLabel] of [
    ["agents", names.agents],
    ["work", names.work],
    ["approvals", names.approvals],
  ]) {
    await page.getByRole("button", { name: navigationLabel, exact: true }).click();
    await inspect(page, configuration, name);
  }

  await page.getByRole("button", { name: names.triggerApproval }).click();
  await inspect(page, configuration, "approval-review");
  await page.getByRole("button", { name: names.reviewEvidence }).click();
  await inspect(page, configuration, "approval-evidence-drawer");
  await page.getByRole("button", { name: names.closeEvidence }).click();

  await page.getByRole("button", { name: names.governance, exact: true }).click();
  await inspect(page, configuration, "governance");
  await page.getByRole("button", { name: names.usage, exact: true }).click();
  await inspect(page, configuration, "usage-billing");
  await page.getByRole("button", { name: names.requestRenewal }).click();
  await inspect(page, configuration, "token-renewal");
  await page.getByRole("dialog").getByRole("button", { name: names.closeRenewal }).click();
  await page.getByRole("button", { name: names.evidence, exact: true }).click();
  await inspect(page, configuration, "evidence");

  evidence.push({ configuration: configuration.id, name: "console", problems: consoleProblems });
  await context.close();

  const localContext = await browser.newContext({ viewport: configuration.viewport });
  await localContext.addInitScript((locale) => {
    window.localStorage.setItem("company-os.locale.v1", locale);
  }, configuration.locale);
  const localPage = await localContext.newPage();
  const localConsoleProblems = [];
  localPage.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      localConsoleProblems.push({ type: message.type(), text: message.text() });
    }
  });
  localPage.on("pageerror", (error) => localConsoleProblems.push({ type: "pageerror", text: error.message }));
  const local = localNames[configuration.locale];
  await localPage.goto(baseUrl);
  await localPage.getByRole("button", { name: local.setup }).click();
  await localPage.getByLabel(local.companyName).fill("UI Audit Company");
  await localPage.getByLabel(local.companyMission).fill("Run accountable work with verifiable evidence.");
  await localPage.getByRole("button", { name: local.continue }).click();
  await localPage.getByLabel(local.departmentName).fill("Operations");
  await localPage.getByRole("button", { name: local.continue }).click();
  await localPage.getByLabel(local.humanName).fill("Alex Chen");
  await localPage.getByLabel(local.humanRole).fill("Operations Lead");
  await localPage.getByRole("button", { name: local.continue }).click();
  await localPage.getByLabel(local.agentName).fill("Research Assistant");
  await localPage.getByLabel(local.agentRole).fill("Prepare evidence-backed operating briefs");
  await localPage.getByRole("button", { name: local.continue }).click();
  await localPage.getByRole("button", { name: local.createCompany }).click();
  await inspect(localPage, configuration, "local-organization");

  const humanTrigger = localPage.getByRole("button", { name: local.viewHuman }).first();
  await humanTrigger.click();
  await inspect(localPage, configuration, "local-human-detail-drawer");
  await localPage.getByRole("dialog").getByRole("button", { name: local.close }).click();
  evidence.push({
    configuration: configuration.id,
    name: "local-human-detail-focus-return",
    returned: await humanTrigger.evaluate((element) => document.activeElement === element),
  });

  await localPage.getByRole("button", { name: local.addAgent, exact: true }).click();
  await inspect(localPage, configuration, "local-create-agent-modal");
  await localPage.getByRole("dialog").getByRole("button", { name: local.close }).click();
  await localPage.getByRole("button", { name: local.newTask }).first().click();
  await inspect(localPage, configuration, "local-create-task-modal");
  await localPage.getByRole("dialog").getByRole("button", { name: local.close }).click();
  evidence.push({ configuration: configuration.id, name: "local-console", problems: localConsoleProblems });
  await localContext.close();
}

await browser.close();
await writeFile(new URL("manifest.json", outputRoot), `${JSON.stringify(evidence, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ phase, captures: evidence.filter(({ path }) => path).length, output: outputRoot.pathname }, null, 2)}\n`);
