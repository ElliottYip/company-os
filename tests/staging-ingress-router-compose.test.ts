import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("stable ingress router remains loopback-only, immutable and outside product networks", async () => {
  const compose = await readFile(new URL("../deploy/compose.staging-ingress-router.yml", import.meta.url), "utf8");
  assert.match(compose, /image: \$\{COMPANY_OS_INGRESS_ROUTER_IMAGE:\?/);
  assert.match(compose, /127\.0\.0\.1:\$\{COMPANY_OS_INGRESS_ROUTER_WEB_PORT/);
  assert.match(compose, /127\.0\.0\.1:\$\{COMPANY_OS_INGRESS_ROUTER_API_PORT/);
  assert.match(compose, /host\.docker\.internal:host-gateway/);
  assert.match(compose, /internal: true/);
  assert.match(compose, /read_only: true/);
  assert.match(compose, /cap_drop:\n\s+- ALL/);
  assert.match(compose, /no-new-privileges:true/);
  assert.doesNotMatch(compose, /company-os-staging-product|company-os-candidate|database|secret/i);
});
