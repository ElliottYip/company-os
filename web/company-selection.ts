import type { CompanyDirectoryProjection } from "./application-client.ts";

const TENANT_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;
const COMPANY_SECTIONS = new Set([
  "office", "inbox", "work", "goals", "projects", "organization", "humans", "agents",
  "approvals", "evidence", "activity", "responsibility", "connectors", "usage", "settings",
]);

export interface CompanyWorkspaceRoute {
  readonly slug: string;
  readonly section?: string;
}

export function parseCompanyWorkspacePath(pathname: string): CompanyWorkspaceRoute | null {
  const match = /^\/([^/]+)\/(?:([^/]+)\/?)?$/.exec(pathname);
  if (!match || !TENANT_SLUG.test(match[1] ?? "") ||
      (match[2] !== undefined && !COMPANY_SECTIONS.has(match[2]))) return null;
  return { slug: match[1] as string, ...(match[2] ? { section: match[2] } : {}) };
}

export function companyWorkspacePath(
  directory: CompanyDirectoryProjection,
  companyId: string,
): string | null {
  const company = directory.companies.find(({ id }) => id === companyId);
  return company?.slug ? `/${company.slug}/` : null;
}

export function resolveFormalCompanySelection(
  directory: CompanyDirectoryProjection,
  selectedCompanyId: string | null,
  storedCompanyId: string | null,
  requestedTenantSlug?: string,
): string | null {
  if (!directory.companies.length) return null;
  if (requestedTenantSlug !== undefined) {
    return directory.companies.find(({ slug }) => slug === requestedTenantSlug)?.id ?? null;
  }
  const available = new Set(directory.companies.map(({ id }) => id));
  if (selectedCompanyId && available.has(selectedCompanyId)) return selectedCompanyId;
  if (storedCompanyId && available.has(storedCompanyId)) return storedCompanyId;
  return directory.companies[0]?.id ?? null;
}
