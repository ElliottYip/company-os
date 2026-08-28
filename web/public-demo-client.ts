import type { DemoPortfolioSnapshot } from "../core/demo-portfolio.ts";

export type PublicDemoPortfolioSnapshot = Omit<DemoPortfolioSnapshot, "sessionId">;

export interface PublicDemoClient {
  create(): Promise<PublicDemoPortfolioSnapshot>;
  read(): Promise<PublicDemoPortfolioSnapshot>;
  recover(): Promise<PublicDemoPortfolioSnapshot>;
  action(input:
    | { readonly action: "RESET" | "TRIGGER_GOVERNED" }
    | { readonly action: "DECIDE"; readonly decision: "APPROVED" | "REJECTED" }
    | {
      readonly action: "REQUEST_RENEWAL";
      readonly targetType: "SUBSCRIPTION" | "CREDENTIAL" | "QUOTA";
      readonly targetId: string;
      readonly reason: string;
    }
  ): Promise<PublicDemoPortfolioSnapshot>;
}

async function responseJson(
  response: Response,
): Promise<PublicDemoPortfolioSnapshot> {
  const value = await response.json() as unknown;
  if (!response.ok) {
    const code = (value as { error?: { code?: unknown } })?.error?.code;
    throw new Error(typeof code === "string" ? code : "PUBLIC_DEMO_REQUEST_FAILED");
  }
  if (!value || typeof value !== "object" ||
      (value as { provenance?: unknown }).provenance !== "DEMO_FIXTURE" ||
      "sessionId" in value) {
    throw new Error("PUBLIC_DEMO_RESPONSE_INVALID");
  }
  return value as PublicDemoPortfolioSnapshot;
}

export function createPublicDemoClient(
  baseUrl: string,
  request: typeof fetch = fetch,
): PublicDemoClient {
  const send = (path: string, init?: RequestInit) => request(
    `${baseUrl}/api/demo/v2/${path}`,
    { credentials: "include", ...init },
  ).then(responseJson);
  return {
    create: () => send("sessions", { method: "POST" }),
    read: () => send("session"),
    recover: () => send("recover", { method: "POST" }),
    action: (input) => send("actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  };
}

