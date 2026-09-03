/** Vendor-neutral, read-only organizational directory projection. */
export interface EnterpriseDirectoryDepartment {
  readonly externalId: string;
  readonly parentExternalId: string | null;
  readonly name: string;
  readonly active: boolean;
}

export interface EnterpriseDirectoryHuman {
  readonly externalId: string;
  readonly displayName: string;
  readonly enterpriseEmail: string | null;
  readonly departmentExternalIds: readonly string[];
  readonly active: boolean;
}

export interface EnterpriseDirectorySnapshot {
  readonly sourceTenantId: string;
  readonly capturedAt: Date;
  readonly departments: readonly EnterpriseDirectoryDepartment[];
  readonly humans: readonly EnterpriseDirectoryHuman[];
}

export interface EnterpriseDirectorySourcePort {
  readSnapshot(): Promise<EnterpriseDirectorySnapshot>;
}
