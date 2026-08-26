import assert from "node:assert/strict";
import test from "node:test";

import { parseAllowedWebOrigins } from "../adapters/http/allowed-web-origins.ts";

test("formal Web origins are exact, deduplicated, and independent from the API public URL", () => {
  assert.deepEqual(parseAllowedWebOrigins(
    "https://app.example.com,https://admin.example.com,https://app.example.com",
    "https://api.example.com",
  ), ["https://api.example.com", "https://app.example.com", "https://admin.example.com"]);
  assert.deepEqual(parseAllowedWebOrigins(undefined, "https://api.example.com/path"), ["https://api.example.com"]);
  assert.deepEqual(parseAllowedWebOrigins("http://127.0.0.1:5173", undefined), ["http://127.0.0.1:5173"]);
});

test("formal Web origins reject paths, credentials, wildcards, and insecure public transport", () => {
  assert.throws(() => parseAllowedWebOrigins("https://app.example.com/path", undefined), /WEB_ORIGIN_INVALID/);
  assert.throws(() => parseAllowedWebOrigins("https://user:pass@app.example.com", undefined), /WEB_ORIGIN_INVALID/);
  assert.throws(() => parseAllowedWebOrigins("*", undefined), /WEB_ORIGIN_INVALID/);
  assert.throws(() => parseAllowedWebOrigins("http://app.example.com", undefined), /WEB_ORIGIN_HTTPS_REQUIRED/);
});
