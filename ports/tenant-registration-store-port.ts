import type { TenantRegistrationRecord } from "../core/tenant-registration.ts";

export type { TenantRegistrationRecord } from "../core/tenant-registration.ts";

export interface TenantRegistrationStorePort {
  create(record: TenantRegistrationRecord): Promise<"CREATED" | "SLUG_TAKEN">;
  findById(id: string): Promise<TenantRegistrationRecord | null>;
  replace(input: {
    readonly expectedRevision: number;
    readonly record: TenantRegistrationRecord;
  }): Promise<"UPDATED" | "CONFLICT">;
}
