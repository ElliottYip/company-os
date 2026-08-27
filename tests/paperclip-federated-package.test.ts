import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createFederatedPortfolioSource } from
  "../connectors/federated-source-reference/index.mjs";

const EXTERNAL_COMPANY = "51d31986-beb3-4f65-a1df-bdbe63ddf98c";

function environment(credential: string): NodeJS.ProcessEnv {
  return {
    COMPANY_OS_PAPERCLIP_BASE_URL: "http://127.0.0.1:3100",
    COMPANY_OS_PAPERCLIP_ANC_COMPANY_ID: "coral-labs",
    COMPANY_OS_PAPERCLIP_COMPANY_ID: EXTERNAL_COMPANY,
    COMPANY_OS_PAPERCLIP_CONNECTOR_ID: "paperclip-alpha",
    COMPANY_OS_PAPERCLIP_RUNTIME_AGENT_ID: "paperclip-runtime",
    COMPANY_OS_PAPERCLIP_ACCOUNTABLE_HUMAN_ID: "human-owner",
    COMPANY_OS_PAPERCLIP_AGENT_BINDINGS: "[]",
    COMPANY_OS_PAPERCLIP_AUTHORIZATION_FILE: credential,
  };
}

test("shipping Federated Source package rejects symbolic-link credentials", () => {
  const directory = mkdtempSync(join(tmpdir(), "company-os-paperclip-package-link-"));
  const credential = join(directory, "board-key");
  const linkedCredential = join(directory, "linked-board-key");
  try {
    writeFileSync(credential, "x".repeat(32), { mode: 0o600 });
    symlinkSync(credential, linkedCredential);
    assert.throws(
      () => createFederatedPortfolioSource(environment(linkedCredential)),
      /PAPERCLIP_AUTHORIZATION_FILE_INVALID/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("shipping Federated Source package re-reads a rotated credential", async () => {
  const directory = mkdtempSync(join(tmpdir(), "company-os-paperclip-package-rotation-"));
  const credential = join(directory, "board-key");
  const authorizations: string[] = [];
  const originalFetch = globalThis.fetch;
  try {
    writeFileSync(credential, "a".repeat(32), { mode: 0o600 });
    chmodSync(credential, 0o600);
    globalThis.fetch = (async (_input, init) => {
      authorizations.push(new Headers(init?.headers).get("authorization") ?? "");
      return Response.json([]);
    }) as typeof fetch;
    const source = createFederatedPortfolioSource(environment(credential));
    await source.synchronize();
    writeFileSync(credential, "b".repeat(32), { mode: 0o600 });
    await source.synchronize();
    assert.deepEqual(authorizations, [
      `Bearer ${"a".repeat(32)}`,
      `Bearer ${"a".repeat(32)}`,
      `Bearer ${"b".repeat(32)}`,
      `Bearer ${"b".repeat(32)}`,
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(directory, { recursive: true, force: true });
  }
});
