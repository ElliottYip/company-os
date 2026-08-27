import assert from "node:assert/strict";
import test from "node:test";

import { buildFederatedSourceReference } from
  "../scripts/build-federated-source-reference.mjs";

test("shipping Federated Source bundle is generated from the reviewed TypeScript source", async () => {
  const result = await buildFederatedSourceReference();
  assert.equal(result.status, "CURRENT");
});
