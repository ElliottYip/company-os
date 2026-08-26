import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type ReferenceOidcIdentity = {
  readonly sub: string;
  readonly name: string;
  readonly email: string;
};

export type ReferenceOidcServer = {
  readonly issuer: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly tlsKey: Buffer;
  readonly tlsCertificate: Buffer;
  close(): Promise<void>;
};

export async function startReferenceOidcServer(
  identity: ReferenceOidcIdentity,
): Promise<ReferenceOidcServer> {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "company-os-reference-oidc-"));
  const keyPath = join(temporaryDirectory, "tls-key.pem");
  const certificatePath = join(temporaryDirectory, "tls-cert.pem");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "1",
    "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1",
    "-keyout", keyPath, "-out", certificatePath,
  ], { stdio: "ignore" });
  const tlsKey = readFileSync(keyPath);
  const tlsCertificate = readFileSync(certificatePath);
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: "jwk" });
  const clientId = `company-os-${randomBytes(8).toString("hex")}`;
  const clientSecret = randomBytes(32).toString("base64url");
  const codes = new Map<string, {
    challenge: string;
    nonce: string | null;
    redirectUri: string;
  }>();
  let issuer = "";
  const server = createServer({ key: tlsKey, cert: tlsCertificate }, async (request, response) => {
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
      return json(response, 200, {
        keys: [{ ...publicJwk, kid: "reference-key", use: "sig", alg: "RS256" }],
      });
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
      assert.ok(stored, "authorization code must be issued by this reference provider");
      assert.equal(form.get("redirect_uri"), stored.redirectUri);
      const basic = basicCredentials(request.headers.authorization);
      assert.equal(form.get("client_id") ?? basic?.[0], clientId);
      assert.equal(form.get("client_secret") ?? basic?.[1], clientSecret);
      assert.equal(
        createHash("sha256").update(required(form.get("code_verifier"))).digest("base64url"),
        stored.challenge,
      );
      codes.delete(code);
      const now = Math.floor(Date.now() / 1_000);
      return json(response, 200, {
        access_token: randomBytes(24).toString("base64url"),
        token_type: "Bearer",
        expires_in: 300,
        id_token: jwt({
          iss: issuer,
          aud: clientId,
          sub: identity.sub,
          iat: now,
          exp: now + 300,
          name: identity.name,
          email: identity.email,
          email_verified: true,
          ...(stored.nonce ? { nonce: stored.nonce } : {}),
        }, privateKey),
      });
    }
    if (url.pathname === "/userinfo") {
      return json(response, 200, { ...identity, email_verified: true });
    }
    return json(response, 404, { error: "not_found" });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  issuer = `https://127.0.0.1:${address.port}`;
  let closed = false;
  return {
    issuer,
    clientId,
    clientSecret,
    tlsKey,
    tlsCertificate,
    async close() {
      if (closed) return;
      closed = true;
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(temporaryDirectory, { recursive: true, force: true });
    },
  };
}

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
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(source),
  });
  response.end(source);
}

function basicCredentials(value: string | undefined): [string, string] | null {
  if (!value?.startsWith("Basic ")) return null;
  const [id, secret] = Buffer.from(value.slice(6), "base64").toString("utf8").split(":", 2);
  return id && secret ? [id, secret] : null;
}

function jwt(claims: object, privateKey: import("node:crypto").KeyObject): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "reference-key" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const input = `${header}.${payload}`;
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url")}`;
}
