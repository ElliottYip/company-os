import assert from "node:assert/strict";
import test from "node:test";
import { readCompanyOsRuntimeConfig } from "../web/runtime-config.ts";

test("runtime Web configuration accepts only the stable public fields", () => {
  assert.deepEqual(readCompanyOsRuntimeConfig({
    __COMPANY_OS_CONFIG__: {
      apiBaseUrl: "https://api.company.example",
      mode: "formal",
      ignoredField: "must-not-be-consumed",
    },
  }), {
    apiBaseUrl: "https://api.company.example",
    mode: "formal",
  });
});

test("runtime Web configuration fails closed for malformed values", () => {
  assert.deepEqual(readCompanyOsRuntimeConfig({ __COMPANY_OS_CONFIG__: "bad" }), {});
  assert.deepEqual(readCompanyOsRuntimeConfig({ __COMPANY_OS_CONFIG__: {
    apiBaseUrl: 42,
    mode: "production",
  } }), { apiBaseUrl: undefined, mode: undefined });
});
