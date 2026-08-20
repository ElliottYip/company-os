import { expect, test } from "@playwright/test";

const viewports = [
  { name: "phone-320", width: 320, height: 720 },
  { name: "tablet-768", width: 768, height: 900 },
  { name: "desktop-1024", width: 1024, height: 800 },
  { name: "desktop-1440", width: 1440, height: 900 },
] as const;

for (const viewport of viewports) {
  test(`Demo responsibility loop is keyboard-operable at ${viewport.name}`, async ({ page }) => {
    const browserProblems: string[] = [];
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) browserProblems.push(`${message.type()}: ${message.text()}`);
    });
    page.on("pageerror", (error) => browserProblems.push(`pageerror: ${error.message}`));
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByText("DEMO FIXTURE · 仅模拟 Agent")).toBeVisible();
    await expect(page.locator("[data-phase=READY]")).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const assign = page.getByRole("button", { name: "分配模拟任务" });
    await assign.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-phase=PLANNING]")).toBeVisible();
    await page.getByRole("button", { name: "推进下一事件" }).click();
    await page.getByRole("button", { name: "推进下一事件" }).click();
    await page.getByRole("button", { name: "推进下一事件" }).click();
    await expect(page.locator("[data-phase=AWAITING_APPROVAL]")).toBeVisible();
    await page.getByRole("button", { name: "批准模拟动作" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-phase=COMPLETED]")).toBeVisible();

    const responsibility = page.getByRole("button", { name: "责任记录" });
    await responsibility.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "完整责任记录" })).toBeVisible();
    await page.getByRole("button", { name: "一键重置" }).click();
    await expect(page.getByText("分配模拟任务后，事件会按固定顺序出现。").first()).toBeVisible();
    expect(browserProblems).toEqual([]);
  });
}

test("Demo rejection and formal unauthorized states are explicit", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "分配模拟任务" }).click();
  await page.getByRole("button", { name: "推进下一事件" }).click();
  await page.getByRole("button", { name: "推进下一事件" }).click();
  await page.getByRole("button", { name: "推进下一事件" }).click();
  await page.getByRole("button", { name: "拒绝" }).click();
  await expect(page.getByText("已拒绝").first()).toBeVisible();

  await page.setContent('<div id="formal-test-root"></div>');
  await page.evaluate(async () => {
    const { mountCompanyOS } = await import("/mount.ts");
    const unavailable = async () => { throw new Error("FORMAL_IDENTITY_REQUIRED"); };
    mountCompanyOS({ mountElement: document.querySelector("#formal-test-root")! }, {
      mode: "FORMAL",
      organization: unavailable,
      administration: unavailable,
      assignmentOptions: unavailable,
      snapshot: unavailable,
      assignWork: unavailable,
      advanceWork: unavailable,
      decideApproval: unavailable,
      resetFixture: unavailable,
    });
  });
  await expect(page.locator('[data-state="UNAUTHORIZED"]')).toContainText("需要正式登录");
  await expect(page.getByRole("button", { name: "重试" })).toBeVisible();
});
