import { expect, test, type Locator, type Page } from "@playwright/test";

type UiLocale = "en" | "zh-CN";

const copy = {
  en: {
    enterDemo: "Explore the Company OS demo",
    portfolio: "Agent Portfolio",
    agents: "Agents",
    work: "Tasks",
    approvals: "Approvals",
    governance: "Governance",
    evidence: "Evidence",
    triggerApproval: "Trigger governed workflow",
    reviewEvidence: "Review evidence",
    evidenceTitle: "Evidence references",
    reject: "Reject",
    rejectApproval: "Reject this approval",
    cancel: "Cancel",
    usage: "Usage & Billing",
    requestRenewal: "Request renewal",
    submitRenewal: "Submit request",
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
    addAgent: "Add Agent",
    addDepartment: "Add department",
    addHuman: "Add human",
    newTask: /New task/i,
  },
  "zh-CN": {
    enterDemo: "体验 Company OS 公开 Demo",
    portfolio: "Agent 资产组合",
    agents: "Agent",
    work: "任务",
    approvals: "审批",
    governance: "接入与治理",
    evidence: "证据",
    triggerApproval: "触发 Governed 工作流",
    reviewEvidence: "查看证据",
    evidenceTitle: "证据引用",
    reject: "拒绝",
    rejectApproval: "拒绝本次审批",
    cancel: "取消",
    usage: "用量与计费",
    requestRenewal: "申请续期",
    submitRenewal: "提交申请",
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
    addAgent: "添加 Agent",
    addDepartment: "添加部门",
    addHuman: "添加真人成员",
    newTask: /新建任务/,
  },
} as const;

async function useLocale(page: Page, locale: UiLocale): Promise<void> {
  await page.addInitScript((value) => localStorage.setItem("company-os.locale.v1", value), locale);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

async function expectSharedTypographyContract(page: Page): Promise<void> {
  const audit = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>(".family-ui");
    const rail = document.querySelector<HTMLElement>(".company-rail");
    const main = document.querySelector<HTMLElement>(".app-main");
    if (!root || !rail || !main) return null;
    const rootStyle = getComputedStyle(root);
    const sizeTokens = [
      "--type-page-title", "--type-detail-title", "--type-section-title", "--type-panel-title", "--type-body",
      "--type-control", "--type-supporting", "--type-label", "--type-micro", "--type-metric",
    ];
    const probe = document.createElement("span");
    probe.hidden = true;
    root.append(probe);
    const allowedSizes = new Set(sizeTokens.map((token) => {
      probe.style.fontSize = `var(${token})`;
      return getComputedStyle(probe).fontSize;
    }));
    probe.remove();
    const allowedWeights = new Set([
      "--weight-regular", "--weight-medium", "--weight-semibold", "--weight-bold",
    ].map((token) => rootStyle.getPropertyValue(token).trim()));
    const elements = main.querySelectorAll<HTMLElement>("h1, h2, h3, p, strong, small, button, a, dt, dd, label, input, textarea, select");
    const invalid = [...elements].filter((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || element.getAttribute("aria-hidden") === "true") return false;
      const style = getComputedStyle(element);
      return style.fontFamily !== rootStyle.fontFamily || !allowedSizes.has(style.fontSize) || !allowedWeights.has(style.fontWeight);
    }).map((element) => {
      const style = getComputedStyle(element);
      return { tag: element.tagName, text: element.textContent?.trim().slice(0, 40), fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight };
    });
    return { railFamily: getComputedStyle(rail).fontFamily, mainFamily: getComputedStyle(main).fontFamily, rootFamily: rootStyle.fontFamily, invalid };
  });
  expect(audit).not.toBeNull();
  expect(audit?.railFamily).toBe(audit?.rootFamily);
  expect(audit?.mainFamily).toBe(audit?.rootFamily);
  expect(audit?.invalid).toEqual([]);
}

async function expectModalCenteredInViewport(modal: Locator, viewportWidth: number, viewportHeight?: number): Promise<void> {
  const box = await modal.boundingBox();
  expect(box).not.toBeNull();
  const expectedX = (viewportWidth - (box?.width ?? 0)) / 2;
  expect(Math.abs((box?.x ?? 0) - expectedX)).toBeLessThanOrEqual(1);
  if (viewportHeight !== undefined) {
    const expectedY = (viewportHeight - (box?.height ?? 0)) / 2;
    expect(Math.abs((box?.y ?? 0) - expectedY)).toBeLessThanOrEqual(1);
    expect((box?.y ?? -1)).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(viewportHeight);
  }
}

const publicViewports = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 320, height: 740 },
] as const;

test("the front door fish video visibly advances at desktop and tablet widths", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const fish = page.locator(".front-door-fish video");
    await expect(fish).toBeAttached();
    const supportsSource = await fish.evaluate((video) => video.canPlayType("video/mp4; codecs=avc1.42E01E") !== "");
    test.skip(!supportsSource, "The installed browser does not include H.264 playback support.");
    await expect.poll(() => fish.evaluate((video) => video.readyState), { timeout: 5_000 }).toBeGreaterThanOrEqual(2);
    await expect.poll(() => fish.evaluate((video) => video.currentTime), { timeout: 5_000 }).toBeGreaterThan(0.1);
    const before = await fish.evaluate((video) => video.currentTime);
    await page.waitForTimeout(500);
    const after = await fish.evaluate((video) => video.currentTime);
    expect(after).toBeGreaterThan(before + 0.2);
    await expect(fish).toHaveJSProperty("paused", false);
    expect(await fish.evaluate((video) => video.currentSrc)).toContain("fish-shadow-loop-desktop.mp4");
  }
});

for (const locale of ["en", "zh-CN"] as const) {
  for (const { width, height } of publicViewports) {
    test(`${locale} public Demo keeps key pages and governed secondary flows consistent at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await useLocale(page, locale);
      const labels = copy[locale];
      await page.goto("/");
      await page.getByRole("button", { name: labels.enterDemo }).click();
      await expect(page.getByRole("heading", { name: labels.portfolio })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectSharedTypographyContract(page);
      if (width <= 860) await expect(page.locator(".mobile-bottom-nav button")).toHaveCount(6);
      if (width <= 560) {
        expect(await page.locator(".topbar-company").evaluate((element) => element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight)).toBe(true);
        expect(await page.locator(".mobile-bottom-nav button span").evaluateAll((elements) => elements.every((element) => element.scrollWidth <= element.clientWidth))).toBe(true);
        const titleCopy = await page.locator(".portfolio-title > div").boundingBox();
        const safetyBadge = await page.locator(".portfolio-title > .portfolio-badge").boundingBox();
        expect((titleCopy?.width ?? 0)).toBeGreaterThan(250);
        expect((safetyBadge?.y ?? 0)).toBeGreaterThanOrEqual((titleCopy?.y ?? 0) + (titleCopy?.height ?? 0));
      }

      await page.getByRole("button", { name: labels.agents, exact: true }).click();
      await expect(page.getByRole("heading", { name: "Agents" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectSharedTypographyContract(page);

      await page.getByRole("button", { name: labels.work, exact: true }).click();
      await expectNoHorizontalOverflow(page);
      await expectSharedTypographyContract(page);

      await page.getByRole("button", { name: labels.approvals, exact: true }).click();
      await page.getByRole("button", { name: labels.triggerApproval }).click();
      const evidenceTrigger = page.getByRole("button", { name: labels.reviewEvidence });
      await evidenceTrigger.click();
      const drawer = page.getByRole("dialog", { name: labels.evidenceTitle });
      await expect(drawer).toBeVisible();
      await expectSharedTypographyContract(page);
      const box = await drawer.boundingBox();
      expect(box).not.toBeNull();
      expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) - width)).toBeLessThanOrEqual(1);
      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
      await expect(evidenceTrigger).toBeFocused();
      await expectSharedTypographyContract(page);

      const rejectTrigger = page.getByRole("button", { name: labels.reject, exact: true });
      await rejectTrigger.click();
      const rejectModal = page.getByRole("dialog", { name: labels.rejectApproval });
      await expect(rejectModal).toBeVisible();
      await expect(rejectModal.getByRole("button", { name: labels.cancel, exact: true })).toBeFocused();
      await expectModalCenteredInViewport(rejectModal, width, height);
      await page.keyboard.press("Escape");
      await expect(rejectModal).toBeHidden();
      await expect(rejectTrigger).toBeFocused();
      await rejectTrigger.click();
      await rejectModal.getByRole("button", { name: labels.reject, exact: true }).click();
      await expect(page.locator(".portfolio-approval-subject > header .portfolio-badge")).toHaveText("REJECTED");

      await page.getByRole("button", { name: labels.governance, exact: true }).click();
      await expectNoHorizontalOverflow(page);
      await expectSharedTypographyContract(page);

      await page.getByRole("button", { name: labels.usage, exact: true }).click();
      await expectSharedTypographyContract(page);
      const renewalTrigger = page.getByRole("button", { name: labels.requestRenewal }).first();
      await renewalTrigger.click();
      const renewalModal = page.getByRole("dialog", { name: labels.requestRenewal });
      await expect(renewalModal).toBeVisible();
      await expect(renewalModal.locator("textarea[name='reason']")).toBeFocused();
      await expectModalCenteredInViewport(renewalModal, width, height);
      await expectSharedTypographyContract(page);
      await renewalModal.getByRole("button", { name: labels.submitRenewal }).click();
      await expect(page.getByText("PENDING_APPROVAL", { exact: true })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectSharedTypographyContract(page);

      await page.getByRole("button", { name: labels.evidence, exact: true }).click();
      await expectNoHorizontalOverflow(page);
      await expectSharedTypographyContract(page);
    });
  }
}

for (const configuration of [
  { locale: "en" as const, width: 1440 },
  { locale: "zh-CN" as const, width: 1024 },
  { locale: "en" as const, width: 768 },
  { locale: "zh-CN" as const, width: 320 },
]) {
  test(`${configuration.locale} local draft uses right details and centered creation overlays at ${configuration.width}px`, async ({ page }) => {
    const { locale, width } = configuration;
    await page.setViewportSize({ width, height: width === 1440 ? 900 : width === 768 ? 1024 : width === 320 ? 740 : 768 });
    await useLocale(page, locale);
    const labels = copy[locale];
    await page.goto("/");
    await page.getByRole("button", { name: labels.setup }).click();
    await page.getByLabel(labels.companyName).fill("UI Contract Company");
    await page.getByLabel(labels.companyMission).fill("Run accountable work with verifiable evidence.");
    await page.getByRole("button", { name: labels.continue }).click();
    await page.getByLabel(labels.departmentName).fill("Operations");
    await page.getByRole("button", { name: labels.continue }).click();
    await page.getByLabel(labels.humanName).fill("Alex Chen");
    await page.getByLabel(labels.humanRole).fill("Operations Lead");
    await page.getByRole("button", { name: labels.continue }).click();
    await page.getByLabel(labels.agentName).fill("Research Assistant");
    await page.getByLabel(labels.agentRole).fill("Prepare evidence-backed briefs");
    await page.getByRole("button", { name: labels.continue }).click();
    await page.getByRole("button", { name: labels.createCompany }).click();

    const pageTitle = await page.locator(".control-page-title").boundingBox();
    const firstSurface = await page.locator(".organization-toolbar").boundingBox();
    expect(pageTitle).not.toBeNull();
    expect(firstSurface).not.toBeNull();
    expect(Math.abs((pageTitle?.x ?? 0) - (firstSurface?.x ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((width - ((pageTitle?.x ?? 0) + (pageTitle?.width ?? 0))) - (width - ((firstSurface?.x ?? 0) + (firstSurface?.width ?? 0))))).toBeLessThanOrEqual(1);
    await expectNoHorizontalOverflow(page);

    const humanTrigger = page.getByRole("button", { name: labels.viewHuman }).first();
    await humanTrigger.click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await expectSharedTypographyContract(page);
    const drawerBox = await drawer.boundingBox();
    expect(Math.abs((drawerBox?.x ?? 0) + (drawerBox?.width ?? 0) - width)).toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
    await expect(humanTrigger).toBeFocused();

    for (const triggerName of [labels.addDepartment, labels.addHuman]) {
      const trigger = page.getByRole("button", { name: triggerName, exact: true });
      await trigger.click();
      const modal = page.getByRole("dialog");
      await expect(modal).toBeVisible();
      await expect(modal.locator("input:not([type='hidden'])").first()).toBeFocused();
      await expectModalCenteredInViewport(modal, width);
      await expectSharedTypographyContract(page);
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
    }

    const agentTrigger = page.getByRole("button", { name: labels.addAgent, exact: true });
    await agentTrigger.click();
    const agentModal = page.getByRole("dialog");
    await expect(agentModal).toBeVisible();
    await expect(agentModal.getByLabel(labels.agentName)).toBeFocused();
    await expectModalCenteredInViewport(agentModal, width);
    if (width === 1440) {
      for (const viewport of [
        { width: 1280, height: 900 },
        { width: 1024, height: 800 },
        { width: 1024, height: 600 },
        { width: 900, height: 760 },
        { width: 861, height: 760 },
        { width: 860, height: 760 },
        { width: 768, height: 760 },
        { width: 768, height: 400 },
        { width: 640, height: 700 },
        { width: 480, height: 700 },
        { width: 320, height: 640 },
      ]) {
        await page.setViewportSize(viewport);
        await expectModalCenteredInViewport(agentModal, viewport.width, viewport.height);
        const actions = await agentModal.getByRole("button", { name: labels.addAgent, exact: true }).boundingBox();
        expect(actions).not.toBeNull();
        expect((actions?.y ?? 0) + (actions?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
        if (viewport.height <= 600) {
          const lastControl = agentModal.locator("select").last();
          await lastControl.focus();
          await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
          const controlBox = await lastControl.boundingBox();
          const footerBox = await agentModal.locator("footer").boundingBox();
          expect(controlBox).not.toBeNull();
          expect(footerBox).not.toBeNull();
          expect((controlBox?.y ?? 0) + (controlBox?.height ?? 0)).toBeLessThanOrEqual((footerBox?.y ?? 0) + 1);
        }
      }
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    await expectSharedTypographyContract(page);
    await page.keyboard.press("Escape");
    await expect(agentTrigger).toBeFocused();

    await page.getByRole("button", { name: labels.newTask }).first().click();
    const taskModal = page.getByRole("dialog");
    await expect(taskModal).toBeVisible();
    await expectModalCenteredInViewport(taskModal, width);
    await expectNoHorizontalOverflow(page);
    await expectSharedTypographyContract(page);
  });
}
