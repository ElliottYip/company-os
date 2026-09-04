import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
const button = page.getByRole("button", { name: "体验 Company OS 公开 Demo" });
await button.click();
await page.waitForTimeout(1500);
const state = await page.evaluate(() => ({
  url: location.href,
  body: document.body.innerText.slice(0, 10000),
  buttons: [...document.querySelectorAll("button")].map((node) => ({
    text: node.textContent?.trim(),
    aria: node.getAttribute("aria-label"),
    section: node.getAttribute("data-section-target"),
    attrs: [...node.attributes].reduce((all, item) => ({ ...all, [item.name]: item.value }), {}),
  })),
  pageStages: [...document.querySelectorAll(".page-stage")].map((node) => node.getAttribute("data-section")),
}));
console.log(JSON.stringify(state, null, 2));
await page.screenshot({ path: "tmp/current-ui-after-demo.png", fullPage: true });
await browser.close();
