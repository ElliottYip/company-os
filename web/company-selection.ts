import type { CompanyDirectoryProjection } from "./application-client.ts";

export function resolveFormalCompanySelection(
  directory: CompanyDirectoryProjection,
  selectedCompanyId: string | null,
  storedCompanyId: string | null,
): string | null {
  if (!directory.companies.length) return null;
  const available = new Set(directory.companies.map(({ id }) => id));
  if (selectedCompanyId && available.has(selectedCompanyId)) return selectedCompanyId;
  if (storedCompanyId && available.has(storedCompanyId)) return storedCompanyId;
  return directory.companies[0]?.id ?? null;
}
