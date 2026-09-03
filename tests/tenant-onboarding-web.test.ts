import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { tenantOnboardingErrorMessage } from "../web/tenant-onboarding.ts";

const root = new URL("../", import.meta.url);

test("tenant onboarding converts internal failures into actionable customer-safe copy", () => {
  assert.equal(tenantOnboardingErrorMessage("TENANT_SIGNUP_NOT_ALLOWED"),
    "邀请码无效或已使用，请联系 Company OS 管理员获取新的邀请码。");
  assert.equal(tenantOnboardingErrorMessage("IDENTITY_BINDING_VERIFICATION_FAILED"),
    "身份应用验证失败，请检查 App ID、App Secret 和应用所属企业。");
  assert.equal(tenantOnboardingErrorMessage("TENANT_SIGNUP_RATE_LIMITED"),
    "尝试次数过多，请稍后再试。");
  assert.equal(tenantOnboardingErrorMessage("UPSTREAM_INTERNAL_DETAIL"),
    "暂时无法完成注册，请稍后重试或联系管理员。");
  assert.doesNotMatch(tenantOnboardingErrorMessage("UPSTREAM_INTERNAL_DETAIL"), /UPSTREAM|INTERNAL/);
});

test("the existing front door remains the entry surface and opens onboarding as a later page", async () => {
  const mount = await readFile(new URL("web/mount.ts", root), "utf8");
  assert.match(mount, /data-enter-local/);
  assert.match(mount, /配置 Company OS/);
  assert.match(mount, /window\.location\.assign\("\/start"\)/);
});

test("onboarding keeps hosted and independent choices provider-neutral and secret-safe", async () => {
  const source = await readFile(new URL("web/tenant-onboarding.ts", root), "utf8");
  assert.match(source, /统一域名 SaaS/);
  assert.match(source, /独立部署/);
  assert.match(source, /身份平台与授权范围由你控制/);
  assert.match(source, /其他支持标准 OIDC 的平台/);
  assert.match(source, /企业自建身份适配器/);
  assert.match(source, /组织架构等额外权限必须由管理员另行启用/);
  assert.match(source, /独立部署模式的 Secret 始终留在你的环境/);
  assert.match(source, /飞书 OAuth · 当前可用/);
  assert.match(source, /标准 OIDC · 即将开放/);
  assert.match(source, /其他平台 \/ 自建适配器 · 可选独立部署/);
  assert.match(source, /标准 OIDC/);
  assert.match(source, /自建身份适配器/);
  assert.match(source, /name="appSecret" type="password"/);
  assert.match(source, /Client ID \/ App ID/);
  assert.match(source, /Client Secret \/ App Secret/);
  assert.match(source, /OAuth 回调地址/);
  assert.match(source, /已保存回调地址，继续企业身份登录/);
  assert.match(source, /callback\.protocol !== "https:"/);
  assert.match(source, /callback\.origin !== expectedOrigin/);
  assert.match(source, /创建后访问路径为 \/公司标识\//);
  assert.doesNotMatch(source, /创建后访问路径为 \/t\/公司标识/);

  const independentForm = source.match(/<form data-independent-tenant-form[\s\S]*?<\/form>/)?.[0];
  assert.ok(independentForm);
  assert.doesNotMatch(independentForm, /name="appSecret"/);
  assert.match(independentForm, /此处不填写任何 Secret/);
  assert.match(source, /appSecretInput\.value = ""/);
  assert.doesNotMatch(source, /innerHTML\s*=\s*.*registration/);
});

test("tenant callback route activates by server-resolved slug rather than a browser registration ID", async () => {
  const main = await readFile(new URL("web/main.ts", root), "utf8");
  const activation = await readFile(new URL("web/tenant-activation.ts", root), "utf8");
  assert.match(main, /mountTenantActivation/);
  assert.match(main, /\^\\\/t\\\//);
  assert.match(activation, /tenant-registrations\/by-slug\/\$\{input\.slug\}\/complete/);
  assert.doesNotMatch(activation, /registrationId/);
  assert.match(activation, /company-os\.selected-company/);
  assert.match(activation, /FORMAL_IDENTITY_REQUIRED/);
  assert.match(activation, /window\.location\.assign\(`\/\$\{completed\.slug\}\/`\)/);
  assert.doesNotMatch(activation, /无法进入公司空间：\$\{code\}/);
});
