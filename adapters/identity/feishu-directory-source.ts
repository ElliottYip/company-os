import type {
  EnterpriseDirectoryDepartment,
  EnterpriseDirectoryHuman,
  EnterpriseDirectorySnapshot,
  EnterpriseDirectorySourcePort,
} from "../../ports/enterprise-directory-source-port.ts";

export interface FeishuDirectoryConfiguration {
  readonly appId: string;
  readonly appSecret: string;
  readonly tenantKey: string;
}

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const API_ORIGIN = "https://open.feishu.cn";
const TOKEN_URL = `${API_ORIGIN}/open-apis/auth/v3/tenant_access_token/internal`;
const MAX_RESPONSE_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MILLISECONDS = 10_000;
const MAX_PAGES = 200;
const MAX_DEPARTMENTS = 10_000;
const MAX_HUMANS = 50_000;
const PORTABLE_ID = /^[A-Za-z0-9_-]{2,255}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function required(value: string, code: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedString(value: unknown, maximum = 255): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && [...normalized].length <= maximum ? normalized : null;
}

async function boundedJson(response: Response, code: string): Promise<Record<string, unknown>> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) throw new Error(code);
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) throw new Error(code);
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { throw new Error(code); }
  const value = record(parsed);
  if (!response.ok || !value) throw new Error(code);
  return value;
}

async function requestJson(
  fetcher: Fetcher,
  url: string,
  init: RequestInit,
  code: string,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetcher(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS) });
  } catch { throw new Error(code); }
  return boundedJson(response, code);
}

function page(value: Record<string, unknown>): {
  readonly items: readonly Record<string, unknown>[];
  readonly hasMore: boolean;
  readonly pageToken: string | null;
} {
  if (value.code !== 0) throw new Error("FEISHU_DIRECTORY_RESPONSE_INVALID");
  const data = record(value.data);
  if (!data || typeof data.has_more !== "boolean") {
    throw new Error("FEISHU_DIRECTORY_RESPONSE_INVALID");
  }
  const rawItems = data.items === undefined && data.has_more === false ? [] : data.items;
  if (!Array.isArray(rawItems)) throw new Error("FEISHU_DIRECTORY_RESPONSE_INVALID");
  const items = rawItems.map(record);
  if (items.some((item) => item === null)) throw new Error("FEISHU_DIRECTORY_RESPONSE_INVALID");
  const pageToken = boundedString(data.page_token, 2_048);
  if (data.has_more && !pageToken) throw new Error("FEISHU_DIRECTORY_RESPONSE_INVALID");
  return { items: items as Record<string, unknown>[], hasMore: data.has_more, pageToken };
}

function mapDepartment(value: Record<string, unknown>): EnterpriseDirectoryDepartment {
  const externalId = boundedString(value.open_department_id);
  const name = boundedString(value.name, 120);
  const rawParent = boundedString(value.parent_department_id);
  const status = record(value.status);
  if (!externalId || !PORTABLE_ID.test(externalId) || !name || !rawParent) {
    throw new Error("FEISHU_DIRECTORY_RESPONSE_INVALID");
  }
  return {
    externalId,
    parentExternalId: rawParent === "0" ? null : rawParent,
    name,
    active: status?.is_deleted !== true,
  };
}

function mapHuman(value: Record<string, unknown>): EnterpriseDirectoryHuman {
  const externalId = boundedString(value.union_id);
  const displayName = boundedString(value.name, 120);
  const rawEmail = boundedString(value.enterprise_email, 254) ?? boundedString(value.email, 254);
  const status = record(value.status);
  if (!externalId || !PORTABLE_ID.test(externalId) || !displayName ||
      !Array.isArray(value.department_ids) || value.department_ids.length > 100) {
    throw new Error("FEISHU_DIRECTORY_RESPONSE_INVALID");
  }
  const departmentExternalIds = [...new Set(value.department_ids.map((entry) => boundedString(entry)))];
  if (departmentExternalIds.some((entry) => !entry || (entry !== "0" && !PORTABLE_ID.test(entry)))) {
    throw new Error("FEISHU_DIRECTORY_RESPONSE_INVALID");
  }
  const enterpriseEmail = rawEmail?.toLocaleLowerCase("en-US") ?? null;
  if (enterpriseEmail !== null && !EMAIL.test(enterpriseEmail)) {
    throw new Error("FEISHU_DIRECTORY_RESPONSE_INVALID");
  }
  return {
    externalId,
    displayName,
    enterpriseEmail,
    departmentExternalIds: departmentExternalIds as string[],
    active: status?.is_resigned !== true && status?.is_frozen !== true && status?.is_activated !== false,
  };
}

export function createFeishuDirectorySource(
  input: FeishuDirectoryConfiguration,
  fetcher: Fetcher = fetch,
  now: () => Date = () => new Date(),
): EnterpriseDirectorySourcePort {
  const appId = required(input.appId, "FEISHU_APP_ID_REQUIRED");
  const appSecret = required(input.appSecret, "FEISHU_APP_SECRET_REQUIRED");
  const tenantKey = required(input.tenantKey, "FEISHU_TENANT_KEY_REQUIRED");
  if (!PORTABLE_ID.test(appId) || !PORTABLE_ID.test(tenantKey)) {
    throw new Error("FEISHU_CONFIGURATION_IDENTIFIER_INVALID");
  }

  async function accessToken(): Promise<string> {
    const response = await requestJson(fetcher, TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8", accept: "application/json" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    }, "FEISHU_DIRECTORY_TOKEN_FAILED");
    const token = boundedString(response.tenant_access_token, 4_096);
    if (response.code !== 0 || !token || !Number.isSafeInteger(response.expire) ||
        Number(response.expire) <= 0 || Number(response.expire) > 86_400) {
      throw new Error("FEISHU_DIRECTORY_TOKEN_FAILED");
    }
    return token;
  }

  async function readPages(urlFor: (pageToken: string | null) => string, token: string) {
    const items: Record<string, unknown>[] = [];
    let pageToken: string | null = null;
    for (let count = 0; count < MAX_PAGES; count += 1) {
      const response = await requestJson(fetcher, urlFor(pageToken), {
        method: "GET",
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      }, "FEISHU_DIRECTORY_REQUEST_FAILED");
      const current = page(response);
      items.push(...current.items);
      if (!current.hasMore) return items;
      pageToken = current.pageToken;
    }
    throw new Error("FEISHU_DIRECTORY_PAGE_LIMIT_EXCEEDED");
  }

  return {
    async readSnapshot(): Promise<EnterpriseDirectorySnapshot> {
      const token = await accessToken();
      const departmentValues = await readPages((pageToken) => {
        const url = new URL("/open-apis/contact/v3/departments/0/children", API_ORIGIN);
        url.searchParams.set("department_id_type", "open_department_id");
        url.searchParams.set("fetch_child", "true");
        url.searchParams.set("page_size", "50");
        if (pageToken) url.searchParams.set("page_token", pageToken);
        return url.href;
      }, token);
      if (departmentValues.length > MAX_DEPARTMENTS) throw new Error("FEISHU_DIRECTORY_SIZE_LIMIT_EXCEEDED");
      const departments = departmentValues.map(mapDepartment);
      const departmentIds = ["0", ...departments.map((department) => department.externalId)];
      const humans = new Map<string, EnterpriseDirectoryHuman>();
      for (const departmentId of departmentIds) {
        const memberValues = await readPages((pageToken) => {
          const url = new URL("/open-apis/contact/v3/users/find_by_department", API_ORIGIN);
          url.searchParams.set("department_id", departmentId);
          url.searchParams.set("department_id_type", "open_department_id");
          url.searchParams.set("user_id_type", "union_id");
          url.searchParams.set("page_size", "50");
          if (pageToken) url.searchParams.set("page_token", pageToken);
          return url.href;
        }, token);
        for (const value of memberValues) {
          const human = mapHuman(value);
          humans.set(human.externalId, human);
          if (humans.size > MAX_HUMANS) throw new Error("FEISHU_DIRECTORY_SIZE_LIMIT_EXCEEDED");
        }
      }
      return { sourceTenantId: tenantKey, capturedAt: now(), departments, humans: [...humans.values()] };
    },
  };
}
