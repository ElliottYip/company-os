import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { createCompanyAuth } from "../adapters/identity/better-auth-instance.ts";
import { SessionCompanyIdentityAdapter } from "../adapters/identity/session-company-identity-adapter.ts";
import { createCompanyAccessDirectory } from "../adapters/persistence/postgres/company-access-directory.ts";
import { createCompanyDatabase } from "../adapters/persistence/postgres/company-database.ts";
import { createPostgresCompanyAccessStore, nextPostgresRecordId } from "../adapters/persistence/postgres/postgres-company-access-store.ts";
import { PostgresEventStore } from "../adapters/persistence/postgres/postgres-event-store.ts";
import { createPostgresHumanInviteStore } from "../adapters/persistence/postgres/postgres-human-invite-store.ts";
import { CompanyBootstrapService } from "../application/company-bootstrap.ts";
import { CompanyRegistry } from "../application/company-registry.ts";
import { AcceptHumanInvite, CreateHumanInvite } from "../application/human-invites.ts";
import { SetupInitialOrganization } from "../application/setup-initial-organization.ts";
import { createIsolatedPostgresTestDatabase } from "./support/isolated-postgres-test-database.ts";

const connectionString = process.env.COMPANY_OS_TEST_DATABASE_URL?.trim();

test("reference OIDC isolates two PKCE sessions and accepts one tenant-bound human invite", {
  skip: connectionString ? false : "COMPANY_OS_TEST_DATABASE_URL is not configured",
}, async () => {
  const isolatedDatabase = await createIsolatedPostgresTestDatabase(
    connectionString as string,
    "oidc_live",
  );
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "company-os-oidc-"));
  const keyPath = join(temporaryDirectory, "tls-key.pem");
  const certificatePath = join(temporaryDirectory, "tls-cert.pem");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "1",
    "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1",
    "-keyout", keyPath, "-out", certificatePath,
  ], { stdio: "ignore" });

  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: "jwk" });
  type ReferenceIdentity = { sub: string; name: string; email: string };
  const ownerIdentity: ReferenceIdentity = {
    sub: "reference-owner", name: "Reference Owner", email: "reference-owner@example.test",
  };
  const memberIdentity: ReferenceIdentity = {
    sub: "reference-member", name: "Reference Member", email: "reference-member@example.test",
  };
  let currentIdentity = ownerIdentity;
  const codes = new Map<string, {
    challenge: string; nonce: string | null; redirectUri: string; identity: ReferenceIdentity;
  }>();
  let issuer = "";
  const clientId = `company-os-${randomBytes(8).toString("hex")}`;
  const clientSecret = randomBytes(32).toString("base64url");
  const idp = createServer({
    key: readFileSync(keyPath),
    cert: readFileSync(certificatePath),
  }, async (request, response) => {
    const url = new URL(request.url ?? "/", issuer || "https://127.0.0.1");
    if (url.pathname === "/.well-known/openid-configuration") {
      return json(response, 200, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        userinfo_endpoint: `${issuer}/userinfo`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
        code_challenge_methods_supported: ["S256"],
        scopes_supported: ["openid", "profile", "email"],
      });
    }
    if (url.pathname === "/jwks") {
      return json(response, 200, { keys: [{ ...publicJwk, kid: "reference-key", use: "sig", alg: "RS256" }] });
    }
    if (url.pathname === "/authorize") {
      assert.equal(url.searchParams.get("client_id"), clientId);
      assert.equal(url.searchParams.get("response_type"), "code");
      assert.equal(url.searchParams.get("code_challenge_method"), "S256");
      const redirectUri = required(url.searchParams.get("redirect_uri"));
      const state = required(url.searchParams.get("state"));
      const code = randomBytes(24).toString("base64url");
      codes.set(code, {
        challenge: required(url.searchParams.get("code_challenge")),
        nonce: url.searchParams.get("nonce"),
        redirectUri,
        identity: structuredClone(currentIdentity),
      });
      response.writeHead(302, {
        location: `${redirectUri}?code=${code}&state=${encodeURIComponent(state)}&iss=${encodeURIComponent(issuer)}`,
      });
      response.end();
      return;
    }
    if (url.pathname === "/token") {
      const form = new URLSearchParams(await body(request));
      const code = required(form.get("code"));
      const stored = codes.get(code);
      assert.ok(stored, "authorization code must be issued by this IdP");
      assert.equal(form.get("redirect_uri"), stored.redirectUri);
      assert.equal(form.get("client_id") ?? basicClientId(request.headers.authorization), clientId);
      assert.equal(form.get("client_secret") ?? basicClientSecret(request.headers.authorization), clientSecret);
      assert.equal(createHash("sha256").update(required(form.get("code_verifier"))).digest("base64url"), stored.challenge);
      codes.delete(code);
      const now = Math.floor(Date.now() / 1000);
      const claims = {
        iss: issuer, aud: clientId, sub: stored.identity.sub, iat: now, exp: now + 300,
        name: stored.identity.name, email: stored.identity.email, email_verified: true,
        ...(stored.nonce ? { nonce: stored.nonce } : {}),
      };
      return json(response, 200, {
        access_token: randomBytes(24).toString("base64url"),
        token_type: "Bearer",
        expires_in: 300,
        id_token: jwt(claims, privateKey),
      });
    }
    if (url.pathname === "/userinfo") {
      return json(response, 200, {
        sub: currentIdentity.sub, name: currentIdentity.name,
        email: currentIdentity.email, email_verified: true,
      });
    }
    json(response, 404, { error: "not_found" });
  });

  const previousTlsSetting = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  const database = createCompanyDatabase(isolatedDatabase.connectionString);
  try {
    await database.migrate();
    await new Promise<void>((resolve, reject) => {
      idp.once("error", reject);
      idp.listen(0, "127.0.0.1", () => resolve());
    });
    const address = idp.address();
    assert.ok(address && typeof address === "object");
    issuer = `https://127.0.0.1:${address.port}`;
    const baseUrl = "https://company-os.reference.test";
    const auth = createCompanyAuth(database.db, {
      baseUrl,
      redirectUri: `${baseUrl}/api/auth/oauth2/callback/enterprise-oidc`,
      issuer,
      discoveryUrl: `${issuer}/.well-known/openid-configuration`,
      clientId,
      clientSecret,
      sessionSecret: randomBytes(48).toString("base64url"),
      instanceId: `reference-${randomBytes(6).toString("hex")}`,
    });
    const authenticate = async (identity: ReferenceIdentity) => {
      currentIdentity = identity;
      const cookies = new Map<string, string>();
      const signIn = await auth.handler(new Request(`${baseUrl}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: baseUrl, "x-company-os-client-chain": "127.0.0.1" },
        body: JSON.stringify({ provider: "enterprise-oidc", callbackURL: "/after-login" }),
      }));
      mergeCookies(cookies, signIn);
      assert.equal(signIn.status, 200);
      const authorizationUrl = (await signIn.json() as { url?: string }).url;
      assert.ok(authorizationUrl?.startsWith(`${issuer}/authorize?`));
      const authorization = await fetch(authorizationUrl, { redirect: "manual" });
      assert.equal(authorization.status, 302);
      const callback = await auth.handler(new Request(required(authorization.headers.get("location")), {
        headers: { cookie: cookieHeader(cookies), "x-company-os-client-chain": "127.0.0.1" },
        redirect: "manual",
      }));
      mergeCookies(cookies, callback);
      assert.equal(callback.status, 302);
      assert.equal(callback.headers.get("location"), "/after-login");
      const session = await auth.api.getSession({ headers: sessionHeaders(cookies) });
      assert.equal(session?.user.email, identity.email);
      assert.equal(session?.user.name, identity.name);
      assert.ok(session?.session.id);
      return { cookies, session };
    };

    const owner = await authenticate(ownerIdentity);
    const member = await authenticate(memberIdentity);
    assert.notEqual(owner.session?.user.id, member.session?.user.id);
    assert.notEqual(owner.session?.session.id, member.session?.session.id);
    assert.notEqual(owner.session?.user.id, ownerIdentity.sub);
    assert.match(owner.session!.user.id, /^[0-9a-f-]{36}$/);

    const ownerUser = owner.session!.user;
    const memberUser = member.session!.user;
    const accessStore = createPostgresCompanyAccessStore(database.db);
    const bootstrap = new CompanyBootstrapService({ store: accessStore, nextId: nextPostgresRecordId });
    assert.equal((await bootstrap.claimFirstInstanceAdmin({
      userId: ownerUser.id, sessionId: owner.session!.session.id,
    })).status, "CLAIMED");
    const company = await bootstrap.createOwnedCompany({
      userId: ownerUser.id, sessionId: owner.session!.session.id,
    }, {
      name: "Reference Company", purpose: "Prove two-user enterprise identity", locale: "en-US",
    });
    const ownerMemberships = await accessStore.listActiveHumanMemberships(ownerUser.id);
    const ownerCompanyIdentity = new SessionCompanyIdentityAdapter({
      user: { id: ownerUser.id, displayName: ownerUser.name }, companyId: company.companyId,
      memberships: ownerMemberships,
      permissionKeys: await accessStore.listPermissionKeys(ownerUser.id, company.companyId),
      isInstanceAdmin: true,
      now: () => new Date().toISOString(), nextId: nextPostgresRecordId,
    });
    const events = new PostgresEventStore(database.db);
    const structure = await new SetupInitialOrganization({
      registry: new CompanyRegistry({
        identity: ownerCompanyIdentity, events,
        now: () => new Date().toISOString(), nextId: nextPostgresRecordId,
      }),
      nextId: nextPostgresRecordId,
    }).execute({
      company: {
        id: company.companyId, name: company.name, purpose: company.purpose, locale: company.locale,
      },
      owner: { id: ownerUser.id, name: ownerUser.name, title: "Founder" },
      departmentName: "Operations",
    });
    const inviteStore = createPostgresHumanInviteStore(database.db);
    const issued = await new CreateHumanInvite({
      identity: ownerCompanyIdentity, events, store: inviteStore,
      now: () => new Date().toISOString(), nextId: nextPostgresRecordId,
      issueToken: () => `company_os_invite_${randomBytes(32).toString("base64url")}`,
      hashToken: (token) => createHash("sha256").update(token).digest("hex"),
    }).execute({
      companyId: company.companyId,
      email: memberUser.email,
      departmentId: structure.organization.departments[0]!.id,
      title: "Operator",
      role: "operator",
    });
    await new AcceptHumanInvite({
      events, store: inviteStore,
      now: () => new Date().toISOString(), nextId: nextPostgresRecordId,
      hashToken: (token) => createHash("sha256").update(token).digest("hex"),
    }).execute({
      token: issued.token,
      user: { id: memberUser.id, name: memberUser.name, email: memberUser.email },
    });
    const memberDirectory = await createCompanyAccessDirectory(database.db).listForUser(memberUser.id);
    assert.deepEqual(memberDirectory.companies.map(({ id, membershipRole }) => ({ id, membershipRole })), [{
      id: company.companyId, membershipRole: "operator",
    }]);
    const memberCompanyIdentity = new SessionCompanyIdentityAdapter({
      user: { id: memberUser.id, displayName: memberUser.name }, companyId: company.companyId,
      memberships: await accessStore.listActiveHumanMemberships(memberUser.id),
      permissionKeys: await accessStore.listPermissionKeys(memberUser.id, company.companyId),
      now: () => new Date().toISOString(), nextId: nextPostgresRecordId,
    });
    await assert.rejects(memberCompanyIdentity.authorize({
      companyId: company.companyId,
      action: "users:manage_permissions",
      resourceId: memberUser.id,
      reason: "Operator must not manage company permissions",
    }), /COMPANY_PERMISSION_REQUIRED/);

    const signOut = await auth.handler(new Request(`${baseUrl}/api/auth/sign-out`, {
      method: "POST",
      headers: { cookie: cookieHeader(member.cookies), origin: baseUrl, "x-company-os-client-chain": "127.0.0.1" },
    }));
    mergeCookies(member.cookies, signOut);
    assert.equal(signOut.status, 200);
    assert.equal(await auth.api.getSession({ headers: sessionHeaders(member.cookies) }), null);
    assert.equal((await auth.api.getSession({ headers: sessionHeaders(owner.cookies) }))?.user.email, ownerIdentity.email);
  } finally {
    await new Promise<void>((resolve) => idp.close(() => resolve()));
    await database.close();
    await isolatedDatabase.dispose();
    if (previousTlsSetting === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTlsSetting;
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

function required(value: string | null): string {
  assert.ok(value);
  return value;
}

async function body(request: import("node:http").IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function json(response: import("node:http").ServerResponse, status: number, value: unknown): void {
  const source = JSON.stringify(value);
  response.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(source) });
  response.end(source);
}

function basicClientId(value: string | undefined): string | null {
  return basicCredentials(value)?.[0] ?? null;
}

function basicClientSecret(value: string | undefined): string | null {
  return basicCredentials(value)?.[1] ?? null;
}

function basicCredentials(value: string | undefined): [string, string] | null {
  if (!value?.startsWith("Basic ")) return null;
  const [id, secret] = Buffer.from(value.slice(6), "base64").toString("utf8").split(":", 2);
  return id && secret ? [id, secret] : null;
}

function jwt(claims: object, privateKey: import("node:crypto").KeyObject): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "reference-key" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signingInput = `${header}.${payload}`;
  return `${signingInput}.${sign("RSA-SHA256", Buffer.from(signingInput), privateKey).toString("base64url")}`;
}

function mergeCookies(jar: Map<string, string>, response: Response): void {
  for (const source of response.headers.getSetCookie()) {
    const [pair] = source.split(";", 1);
    const separator = pair?.indexOf("=") ?? -1;
    if (!pair || separator <= 0) continue;
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (!value || /max-age=0/i.test(source)) jar.delete(name);
    else jar.set(name, value);
  }
}

function cookieHeader(jar: Map<string, string>): string {
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

function sessionHeaders(jar: Map<string, string>): Headers {
  return new Headers({
    cookie: cookieHeader(jar),
    "x-company-os-client-chain": "127.0.0.1",
  });
}
