import { createCompanyDatabase } from "../adapters/persistence/postgres/company-database.ts";
import { readSecretFileEnvironment } from "../adapters/config/secret-file-environment.ts";

const connectionString = await readSecretFileEnvironment("COMPANY_OS_DATABASE_URL");
if (!connectionString) throw new Error("COMPANY_OS_DATABASE_URL is required");

const database = createCompanyDatabase(connectionString);
try {
  await database.migrate();
  process.stdout.write(JSON.stringify({ event: "company_os.migrations_applied" }) + "\n");
} finally {
  await database.close();
}
