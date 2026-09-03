import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { toNodeHandler } from "better-auth/node";
import type { IncomingMessage, ServerResponse } from "node:http";
import { companyAuthSchema } from "../persistence/postgres/auth-schema.ts";
import type { createCompanyDatabase } from "../persistence/postgres/company-database.ts";
import {
  buildConfiguredCompanyAuthOptions,
  type CompanyAuthConfiguration,
} from "./better-auth-options.ts";

type CompanyDatabase = ReturnType<typeof createCompanyDatabase>["db"];

export function createCompanyAuth(database: CompanyDatabase, configuration: CompanyAuthConfiguration) {
  return betterAuth(buildConfiguredCompanyAuthOptions(configuration, drizzleAdapter(database, {
    provider: "pg",
    schema: companyAuthSchema,
  })));
}

export function createCompanyAuthWebHandler(auth: ReturnType<typeof createCompanyAuth>) {
  return (request: Request): Promise<Response> => Promise.resolve(auth.handler(request));
}

export function createCompanyAuthHandler(
  auth: ReturnType<typeof createCompanyAuth>,
  configuration: { readonly trustForwardedFor?: boolean } = {},
) {
  const handler = toNodeHandler(auth);
  return (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const peer = request.socket.remoteAddress;
    const forwarded = configuration.trustForwardedFor ? request.headers["x-forwarded-for"] : undefined;
    const forwardedSource = Array.isArray(forwarded) ? forwarded.join(",") : forwarded;
    const chain = [forwardedSource, peer].filter((value): value is string => Boolean(value?.trim())).join(", ");
    if (chain) request.headers["x-company-os-client-chain"] = chain;
    return Promise.resolve(handler(request, response));
  };
}

export async function resolveCompanyAuthSession(
  auth: ReturnType<typeof createCompanyAuth>,
  request: IncomingMessage,
) {
  const headers = new Headers();
  for (const [key, raw] of Object.entries(request.headers)) {
    if (Array.isArray(raw)) raw.forEach((value) => headers.append(key, value));
    else if (raw !== undefined) headers.set(key, raw);
  }
  const value = await auth.api.getSession({ headers });
  return value?.session && value.user ? { session: value.session, user: value.user } : null;
}
