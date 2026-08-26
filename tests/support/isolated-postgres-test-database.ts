import { randomBytes } from "node:crypto";
import postgres from "postgres";

export type IsolatedPostgresTestDatabase = {
  connectionString: string;
  dispose(): Promise<void>;
};

export async function createIsolatedPostgresTestDatabase(
  baseConnectionString: string,
  label: string,
): Promise<IsolatedPostgresTestDatabase> {
  const safeLabel = label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "_").replaceAll(/^_+|_+$/g, "") || "test";
  const databaseName = `company_os_${safeLabel}_${randomBytes(8).toString("hex")}`;
  const administrator = postgres(baseConnectionString, { max: 1 });
  try {
    await administrator`CREATE DATABASE ${administrator(databaseName)}`;
  } finally {
    await administrator.end();
  }

  const isolatedUrl = new URL(baseConnectionString);
  isolatedUrl.pathname = `/${databaseName}`;

  let disposed = false;
  return {
    connectionString: isolatedUrl.toString(),
    async dispose() {
      if (disposed) return;
      disposed = true;
      const cleanup = postgres(baseConnectionString, { max: 1 });
      try {
        await cleanup`DROP DATABASE ${cleanup(databaseName)} WITH (FORCE)`;
      } finally {
        await cleanup.end();
      }
    },
  };
}
