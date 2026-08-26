import { randomUUID } from "node:crypto";
import { ManagedInstanceAdminProvisioningService } from "../application/provision-managed-instance-admin.ts";
import { createCompanyDatabase } from "../adapters/persistence/postgres/company-database.ts";
import { PostgresCompanyAccessStore } from "../adapters/persistence/postgres/postgres-company-access-store.ts";
import { PostgresVerifiedHumanDirectory } from "../adapters/persistence/postgres/postgres-verified-human-directory.ts";

if (process.env.COMPANY_OS_PROFILE?.trim() !== "managed-cloud") {
  throw new Error("MANAGED_CLOUD_PROFILE_REQUIRED");
}
const databaseUrl = process.env.COMPANY_OS_DATABASE_URL?.trim();
const email = process.env.COMPANY_OS_PROVISION_ADMIN_EMAIL?.trim();
if (!databaseUrl || !email) throw new Error("MANAGED_ADMIN_PROVISIONING_CONFIGURATION_REQUIRED");

const database = createCompanyDatabase(databaseUrl);
try {
  await database.ping();
  await database.checkSchema();
  const service = new ManagedInstanceAdminProvisioningService({
    humans: new PostgresVerifiedHumanDirectory(database.db),
    access: new PostgresCompanyAccessStore(database.db),
    nextId: randomUUID,
  });
  process.stdout.write(`${JSON.stringify(await service.provision(email))}\n`);
} finally {
  await database.close();
}
