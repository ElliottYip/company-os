import assert from "node:assert/strict";
import test from "node:test";
import { t, zhCN, type CompanyOSMessageKey } from "../web/i18n/zh-CN.ts";

test("Chinese customer copy is Company OS-owned and uses fixed responsibility terminology", () => {
  assert.equal(t("office.fixtureAgent"), "模拟 Agent");
  assert.equal(t("office.accountableHuman"), "真人负责人");
  assert.match(t("demo.safetyFooter"), /责任合同/);
  assert.doesNotMatch(Object.values(zhCN).join("\n"), /人类用户|审核机器人|提示词合同|思维链|模型真相|智能等级/);
});

test("missing i18n keys fail instead of leaking a raw key", () => {
  assert.throws(
    () => t("missing.raw.key" as CompanyOSMessageKey),
    /Missing Company OS translation/,
  );
});

