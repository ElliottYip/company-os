interface TenantCompletionResponse {
  readonly status: "COMPLETED" | "ALREADY_COMPLETED";
  readonly companyId: string;
  readonly slug: string;
}

function errorCode(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "TENANT_ACTIVATION_FAILED";
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") return "TENANT_ACTIVATION_FAILED";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "TENANT_ACTIVATION_FAILED";
}

export function mountTenantActivation(root: HTMLElement, input: {
  readonly slug: string;
  readonly apiBaseUrl?: string;
}): void {
  const apiBaseUrl = input.apiBaseUrl?.replace(/\/$/, "") ?? "";
  root.innerHTML = `<main class="tenant-activation"><section aria-live="polite" aria-labelledby="tenant-activation-title">
    <a href="/" aria-label="返回 Company OS 首页"><span aria-hidden="true">C</span><strong>Company OS</strong></a>
    <p class="family-kicker">COMPANY IDENTITY</p>
    <h1 id="tenant-activation-title">正在进入公司空间</h1>
    <p data-tenant-activation-detail>正在校验企业身份和成员权限…</p>
    <div data-tenant-activation-action></div>
  </section></main>`;
  const detail = root.querySelector<HTMLElement>("[data-tenant-activation-detail]")!;
  const action = root.querySelector<HTMLElement>("[data-tenant-activation-action]")!;

  function signIn(): void {
    action.replaceChildren();
    detail.textContent = "正在打开该公司的身份平台…";
    void fetch(`${apiBaseUrl}/t/${input.slug}/sign-in`, {
      method: "POST",
      credentials: "include",
    }).then(async (response) => {
      const body = await response.json().catch(() => ({})) as { url?: unknown };
      if (!response.ok || typeof body.url !== "string") throw new Error("TENANT_SIGN_IN_FAILED");
      window.location.assign(body.url);
    }).catch((error: unknown) => renderFailure(error));
  }

  function renderSignIn(): void {
    detail.textContent = "请先使用这家公司配置的身份平台登录。";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "使用企业身份登录";
    button.addEventListener("click", signIn);
    action.replaceChildren(button);
  }

  function renderFailure(error: unknown): void {
    const code = error instanceof Error ? error.message : "TENANT_ACTIVATION_FAILED";
    if (code === "FORMAL_IDENTITY_REQUIRED") {
      renderSignIn();
      return;
    }
    detail.textContent = "无法进入公司空间，请检查访问地址或联系管理员。";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "重新校验";
    retry.addEventListener("click", complete);
    action.replaceChildren(retry);
  }

  function complete(): void {
    action.replaceChildren();
    detail.textContent = "正在校验企业身份和成员权限…";
    void fetch(`${apiBaseUrl}/api/v1/tenant-registrations/by-slug/${input.slug}/complete`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorCode(payload));
      const completed = payload as Partial<TenantCompletionResponse>;
      if (!completed.companyId || completed.slug !== input.slug ||
          !["COMPLETED", "ALREADY_COMPLETED"].includes(String(completed.status))) {
        throw new Error("TENANT_ACTIVATION_RESPONSE_INVALID");
      }
      window.localStorage.setItem("company-os.selected-company", completed.companyId);
      detail.textContent = "企业身份已验证，公司空间已就绪。";
      window.location.assign(`/${completed.slug}/`);
    }).catch((error: unknown) => renderFailure(error));
  }

  complete();
}
