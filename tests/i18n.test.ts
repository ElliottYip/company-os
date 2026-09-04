import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { en, type CompanyOSMessageKey } from "../web/i18n/en.ts";
import { zhCN } from "../web/i18n/zh-CN.ts";
import {
  COMPANY_OS_LOCALE_STORAGE_KEY,
  getActiveLocale,
  readStoredLocale,
  setActiveLocale,
  t,
} from "../web/i18n/index.ts";

test("existing Demo copy keeps fixture and responsibility safety terminology", () => {
  assert.equal(t("demo.executors"), "2 simulated Agents");
  assert.match(t("demo.accountability"), /human remains accountable/);
  assert.match(t("demo.safetyFooter"), /responsibility bindings/);
  assert.doesNotMatch(Object.values(en).join("\n"), /人类用户|审核机器人|提示词合同|思维链|模型真相|智能等级/);
});

test("the current locale boundary never leaks a raw message key", () => {
  assert.throws(
    () => t("missing.raw.key" as CompanyOSMessageKey),
    /Missing Company OS translation/,
  );
});

test("English and Simplified Chinese dictionaries have the same typed keys", () => {
  assert.deepEqual(Object.keys(zhCN).sort(), Object.keys(en).sort());
});

test("locale selection persists without treating authored content as translatable UI", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
  };

  setActiveLocale("zh-CN", storage);
  assert.equal(getActiveLocale(), "zh-CN");
  assert.equal(t("nav.settings"), "设置");
  assert.equal(values.get(COMPANY_OS_LOCALE_STORAGE_KEY), "zh-CN");
  assert.equal(readStoredLocale(storage, "en-US"), "zh-CN");

  const authoredEvidence = "Agent output: 原始文本 / original text";
  assert.equal(authoredEvidence, "Agent output: 原始文本 / original text");
  setActiveLocale("en");
});

test("invalid or unavailable locale storage safely falls back to browser language", () => {
  assert.equal(readStoredLocale(undefined, "zh-Hans-CN"), "zh-CN");
  assert.equal(readStoredLocale({ getItem: () => "fr", setItem: () => undefined }, "en-US"), "en");
});

test("Simplified Chinese product copy avoids literal translationese while preserving product terms", () => {
  const productCopy = [
    Object.values(zhCN).join("\n"),
    readFileSync(new URL("../web/mount.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../web/pages/operational-pages.ts", import.meta.url), "utf8"),
  ].join("\n");

  for (const phrase of [
    "产品设置属于 Company OS",
    "只有责任、能力、权限、数据和运行时绑定全部通过时才允许执行",
    "失败时拒绝",
    "尚未连接用量投影",
    "真人决定只绑定一个不可变的高风险动作和责任上下文",
    "负责真人",
    "公司负责人",
    "稳定 code",
    "达到上限时硬停止",
    "owner 成员关系",
    "真人主体",
    "下一步将接通 OIDC",
  ]) {
    assert.doesNotMatch(productCopy, new RegExp(phrase));
  }

  for (const preferredCopy of [
    "真人负责人",
    "数据授权合同",
    "任务执行条件",
    "校验未通过即拒绝",
    "接入与治理",
    "有效会话建立前，系统不会加载公司数据",
  ]) {
    assert.match(productCopy, new RegExp(preferredCopy));
  }

  assert.match(productCopy, /Company OS/);
  assert.match(productCopy, /Agent/);
  assert.match(productCopy, /Connector/);
  assert.match(productCopy, /IdentityPort/);
});
