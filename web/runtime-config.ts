export interface CompanyOsRuntimeConfig {
  readonly apiBaseUrl?: string;
  readonly mode?: "formal" | "demo";
}

export function readCompanyOsRuntimeConfig(source: unknown): CompanyOsRuntimeConfig {
  if (!source || typeof source !== "object") return {};
  const candidate = (source as Record<string, unknown>).__COMPANY_OS_CONFIG__;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return {};
  const record = candidate as Record<string, unknown>;
  return {
    apiBaseUrl: typeof record.apiBaseUrl === "string" ? record.apiBaseUrl : undefined,
    mode: record.mode === "formal" || record.mode === "demo" ? record.mode : undefined,
  };
}
