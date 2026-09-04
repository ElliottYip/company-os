import { createServer } from "node:http";

const origin = "http://127.0.0.1:4631";
const server = createServer((request, response) => {
  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("access-control-allow-credentials", "true");
  response.setHeader("content-type", "application/json");
  if (request.method === "OPTIONS") {
    response.setHeader("access-control-allow-methods", "GET, POST");
    response.setHeader("access-control-allow-headers", "content-type");
    response.writeHead(204).end();
    return;
  }
  if (request.method === "GET" && request.url === "/api/v1/access") {
    response.end(JSON.stringify({
      schemaVersion: 1,
      mode: "FORMAL",
      deploymentProfile: "managed-cloud",
      entryState: "AUTHENTICATION_REQUIRED",
      identityProvider: { protocol: "OAUTH2", providerId: "feishu", configured: true },
      session: { authenticated: false },
      capabilities: {
        diagnostics: true,
        identitySettings: true,
        companyData: false,
        companyMutation: false,
        execution: false,
        approval: false,
        governance: false,
      },
      blockers: [{ code: "FORMAL_IDENTITY_REQUIRED", parameters: {} }],
    }));
    return;
  }
  if (request.method === "POST" && request.url === "/api/auth/sign-in/social") {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const provider = JSON.parse(body).provider;
      process.stdout.write(JSON.stringify({ observedProvider: provider }) + "\n");
      if (provider !== "feishu") {
        response.writeHead(404).end(JSON.stringify({ code: "PROVIDER_NOT_FOUND" }));
        return;
      }
      response.end(JSON.stringify({ url: "https://accounts.feishu.cn/open-apis/authen/v1/authorize" }));
    });
    return;
  }
  response.writeHead(404).end(JSON.stringify({ code: "NOT_FOUND" }));
});

server.listen(4632, "127.0.0.1", () => process.stdout.write("mock-ready\n"));
