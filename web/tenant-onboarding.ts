type OnboardingMode = "shared" | "independent";

interface TenantRegistrationResponse {
  readonly id: string;
  readonly slug: string;
  readonly providerId: string;
  readonly tenantDisplayName: string;
  readonly callbackUri: string;
}

export function tenantOnboardingErrorMessage(code: string): string {
  if (code === "TENANT_SIGNUP_NOT_ALLOWED") {
    return "邀请码无效或已使用，请联系 Company OS 管理员获取新的邀请码。";
  }
  if (code === "IDENTITY_BINDING_VERIFICATION_FAILED") {
    return "身份应用验证失败，请检查 App ID、App Secret 和应用所属企业。";
  }
  if (code === "TENANT_SIGNUP_RATE_LIMITED") {
    return "尝试次数过多，请稍后再试。";
  }
  return "暂时无法完成注册，请稍后重试或联系管理员。";
}

function exactCallbackUri(registration: TenantRegistrationResponse, apiBaseUrl: string): string {
  if (!/^feishu-[a-z0-9](?:[a-z0-9-]{1,92}[a-z0-9])?$/.test(registration.providerId)) {
    throw new Error("TENANT_CALLBACK_INVALID");
  }
  let callback: URL;
  try { callback = new URL(registration.callbackUri); } catch { throw new Error("TENANT_CALLBACK_INVALID"); }
  const expectedOrigin = new URL(apiBaseUrl || window.location.origin, window.location.origin).origin;
  if (callback.protocol !== "https:" || callback.origin !== expectedOrigin || callback.search || callback.hash ||
      callback.pathname !== `/api/auth/oauth2/callback/${registration.providerId}`) {
    throw new Error("TENANT_CALLBACK_INVALID");
  }
  return callback.href;
}

function template(): string {
  return `<main class="tenant-onboarding" aria-labelledby="tenant-onboarding-title">
    <header class="tenant-onboarding-header"><a href="/" aria-label="返回 Company OS 首页"><span aria-hidden="true">C</span><strong>Company OS</strong></a><small>企业接入</small></header>
    <div class="tenant-onboarding-layout">
      <section class="tenant-onboarding-intro">
        <p class="family-kicker">COMPANY ONBOARDING</p>
        <h1 id="tenant-onboarding-title">选择公司的使用方式</h1>
        <p>两种方式使用同一套 Company OS。每家公司绑定自己的身份平台，身份和数据不会跨公司复用。</p>
        <div class="tenant-mode-picker" role="radiogroup" aria-label="部署方式">
          <button type="button" role="radio" aria-checked="true" data-tenant-mode="shared"><strong>统一域名 SaaS</strong><span>无需准备域名和服务器，由 Company OS 托管</span></button>
          <button type="button" role="radio" aria-checked="false" data-tenant-mode="independent"><strong>独立部署</strong><span>使用自己的域名、数据库和运行环境</span></button>
        </div>
        <aside class="tenant-security-note"><strong>身份平台与授权范围由你控制</strong><p>可以使用飞书、其他支持标准 OIDC 的平台，或企业自建身份适配器。默认只申请登录必需权限；组织架构等额外权限必须由管理员另行启用。</p><p>托管模式提交的 Secret 会立即加密且不回显；独立部署模式的 Secret 始终留在你的环境，不会发给 Company OS。</p></aside>
      </section>
      <section class="tenant-onboarding-form-panel">
        <form data-shared-tenant-form aria-labelledby="shared-tenant-title">
          <p class="family-kicker">MANAGED CLOUD</p><h2 id="shared-tenant-title">创建托管公司空间</h2>
          <label>身份平台<select name="identityProvider" required><option value="FEISHU">飞书 OAuth · 当前可用</option><option value="OIDC" disabled>标准 OIDC · 即将开放</option><option value="CUSTOM_ADAPTER" disabled>其他平台 / 自建适配器 · 可选独立部署</option></select><small>每家公司绑定自己的身份平台；同一平台账号不会自动加入其他公司。</small></label>
          <label>公司名称<input name="companyName" maxlength="160" autocomplete="organization" required></label>
          <label>公司访问标识<input name="slug" pattern="[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])" maxlength="48" placeholder="例如 leike-ai" autocapitalize="none" required><small>创建后访问路径为 /公司标识/</small></label>
          <label>注册邀请码<input name="inviteCode" pattern="COS-[A-HJ-NP-Z2-9]{5}(?:-[A-HJ-NP-Z2-9]{5}){3}" maxlength="29" autocomplete="one-time-code" autocapitalize="characters" placeholder="COS-XXXXX-XXXXX-XXXXX-XXXXX" required><small>每个邀请码只能成功创建一家公司的空间。</small></label>
          <label>身份应用 Client ID / App ID<input name="appId" maxlength="255" autocomplete="off" required></label>
          <label>身份应用 Client Secret / App Secret<input name="appSecret" type="password" minlength="16" maxlength="1024" autocomplete="new-password" required><small>仅用于验证你所选身份平台的企业归属；只写入、不回显，并由服务端使用 AES-256-GCM 加密。</small></label>
          <button type="submit">验证身份平台并创建</button>
        </form>
        <form data-independent-tenant-form hidden aria-labelledby="independent-tenant-title">
          <p class="family-kicker">SELF-HOSTED</p><h2 id="independent-tenant-title">生成独立部署交接单</h2>
          <label>公司名称<input name="companyName" maxlength="160" autocomplete="organization" required></label>
          <label>公司标识<input name="slug" pattern="[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])" maxlength="48" required></label>
          <label>部署域名<input name="domain" inputmode="url" placeholder="os.company.example" required><small>需要可配置 HTTPS 和身份登录回调地址的域名。</small></label>
          <label>身份接入方式<select name="identityProvider" required><option value="FEISHU">飞书 OAuth</option><option value="OIDC">标准 OIDC</option><option value="CUSTOM_ADAPTER">自建身份适配器</option></select><small>自建适配器需实现 Company OS 的统一身份合同。</small></label>
          <label>应用 Client ID / 配置引用<input name="appId" maxlength="255" autocomplete="off" required></label>
          <p class="tenant-form-boundary">此处不填写任何 Secret。交接单会列出需要在客户环境中设置的 Secret 名称、镜像、迁移、验收与回滚步骤。</p>
          <button type="submit">生成交接单</button>
        </form>
        <div class="tenant-onboarding-result" data-tenant-result role="status" aria-live="polite" hidden></div>
      </section>
    </div>
  </main>`;
}

async function jsonRequest<T>(url: string, body: Record<string, string>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const code = (payload.error as Record<string, unknown> | undefined)?.code;
    throw new Error(typeof code === "string" ? code : "ONBOARDING_REQUEST_FAILED");
  }
  return payload as T;
}

export function mountTenantOnboarding(root: HTMLElement, input: { readonly apiBaseUrl?: string }): void {
  const apiBaseUrl = input.apiBaseUrl?.replace(/\/$/, "") ?? "";
  root.innerHTML = template();
  const result = root.querySelector<HTMLElement>("[data-tenant-result]")!;
  const sharedForm = root.querySelector<HTMLFormElement>("[data-shared-tenant-form]")!;
  const independentForm = root.querySelector<HTMLFormElement>("[data-independent-tenant-form]")!;
  let mode: OnboardingMode = "shared";

  function showResult(kind: "progress" | "success" | "error", title: string, detail: string): void {
    result.hidden = false;
    result.dataset.kind = kind;
    result.replaceChildren();
    const heading = document.createElement("strong");
    const paragraph = document.createElement("p");
    heading.textContent = title;
    paragraph.textContent = detail;
    result.append(heading, paragraph);
  }

  root.querySelectorAll<HTMLButtonElement>("[data-tenant-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      mode = button.dataset.tenantMode as OnboardingMode;
      root.querySelectorAll<HTMLButtonElement>("[data-tenant-mode]").forEach((candidate) =>
        candidate.setAttribute("aria-checked", String(candidate === button)));
      sharedForm.hidden = mode !== "shared";
      independentForm.hidden = mode !== "independent";
      result.hidden = true;
      (mode === "shared" ? sharedForm : independentForm).querySelector<HTMLInputElement>("input")?.focus();
    });
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const choices = [...root.querySelectorAll<HTMLButtonElement>("[data-tenant-mode]")];
      const offset = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
      const next = choices[(choices.indexOf(button) + offset + choices.length) % choices.length];
      next?.focus();
      next?.click();
    });
  });

  sharedForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const submit = sharedForm.querySelector<HTMLButtonElement>("button[type=submit]")!;
    const fields = new FormData(sharedForm);
    const appSecretInput = sharedForm.elements.namedItem("appSecret") as HTMLInputElement;
    submit.disabled = true;
    showResult("progress", "正在验证身份平台", "验证企业归属通过后才会创建公司空间，请稍候。 ");
    void jsonRequest<TenantRegistrationResponse>(`${apiBaseUrl}/api/v1/tenant-registrations`, {
      companyName: String(fields.get("companyName") ?? ""),
      slug: String(fields.get("slug") ?? ""),
      inviteCode: String(fields.get("inviteCode") ?? ""),
      appId: String(fields.get("appId") ?? ""),
      appSecret: String(fields.get("appSecret") ?? ""),
    }).then((registration) => {
      const callbackUri = exactCallbackUri(registration, apiBaseUrl);
      showResult("success", `${registration.tenantDisplayName} 已验证`,
        "公司空间已保留。请先在身份平台后台保存下面的精确 OAuth 回调地址，再继续登录。");
      const callbackLabel = document.createElement("label");
      callbackLabel.className = "tenant-callback-field";
      callbackLabel.textContent = "OAuth 回调地址";
      const callbackInput = document.createElement("input");
      callbackInput.type = "url";
      callbackInput.readOnly = true;
      callbackInput.value = callbackUri;
      callbackInput.setAttribute("aria-label", "OAuth 回调地址");
      callbackLabel.append(callbackInput);
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "tenant-copy-callback";
      copy.textContent = "复制回调地址";
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(callbackUri);
          copy.textContent = "已复制";
        } catch {
          callbackInput.focus();
          callbackInput.select();
          copy.textContent = "已选中，请复制";
        }
      });
      const signIn = document.createElement("button");
      signIn.type = "button";
      signIn.textContent = "已保存回调地址，继续企业身份登录";
      signIn.addEventListener("click", () => {
        signIn.disabled = true;
        void fetch(`${apiBaseUrl}/t/${registration.slug}/sign-in`, {
          method: "POST", credentials: "include",
        }).then(async (response) => {
          const authorization = await response.json() as { readonly url?: string };
          if (!response.ok) throw new Error("TENANT_SIGN_IN_FAILED");
          return authorization;
        }).then((authorization) => {
            if (!authorization.url) throw new Error("AUTHORIZATION_URL_MISSING");
            window.location.assign(authorization.url);
          }).catch((error: unknown) => showResult("error", "无法开始企业身份登录",
            error instanceof Error ? error.message : "ONBOARDING_REQUEST_FAILED"));
      });
      result.append(callbackLabel, copy, signIn);
    }).catch((error: unknown) => showResult("error", "未能创建公司空间",
      tenantOnboardingErrorMessage(error instanceof Error ? error.message : "ONBOARDING_REQUEST_FAILED")))
      .finally(() => { appSecretInput.value = ""; submit.disabled = false; });
  });

  independentForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const submit = independentForm.querySelector<HTMLButtonElement>("button[type=submit]")!;
    const fields = new FormData(independentForm);
    submit.disabled = true;
    showResult("progress", "正在生成交接单", "不会上传或保存任何身份平台的 Client Secret。");
    void jsonRequest<Record<string, unknown>>(`${apiBaseUrl}/api/v1/deployment-handoffs`, {
      companyName: String(fields.get("companyName") ?? ""),
      slug: String(fields.get("slug") ?? ""),
      domain: String(fields.get("domain") ?? ""),
      appId: String(fields.get("appId") ?? ""),
      identityProvider: String(fields.get("identityProvider") ?? "FEISHU"),
    }).then((handoff) => {
      const blob = new Blob([JSON.stringify(handoff, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `company-os-${String(fields.get("slug") ?? "deployment")}-handoff.json`;
      link.textContent = "下载独立部署交接单";
      showResult("success", "交接单已生成", "交给部署负责人，在客户环境中填写 Secret 并执行迁移与验收。 ");
      result.append(link);
    }).catch((error: unknown) => showResult("error", "未能生成交接单",
      error instanceof Error ? error.message : "ONBOARDING_REQUEST_FAILED"))
      .finally(() => { submit.disabled = false; });
  });
}
